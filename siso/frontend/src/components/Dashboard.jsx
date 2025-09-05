import { Plus, Home, History, Bell, Settings, Send, ReceiptText, ArrowLeft, Mic, RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'
import { ConnectWallet, useAddress, useSigner, useBalance, useContract } from "@thirdweb-dev/react"

function Dashboard({ onNavigate }) {
  const [showAIPopup, setShowAIPopup] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tokenBalances, setTokenBalances] = useState([])
  
  const address = useAddress()
  const signer = useSigner()
  
  // Get native token balance (ETH)
  const { data: ethBalance, isLoading: ethLoading } = useBalance()
  
  // Alchemy API configuration
  const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY || 'YOUR_ALCHEMY_API_KEY_HERE'
  const ALCHEMY_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
  
  // Common ERC-20 token contracts (on Ethereum mainnet)
  const tokenContracts = {
    USDC: "0xA0b86a33E6441231e9e08c6eA4B6c9F2b5D0F6A0", // Example USDC contract
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT contract
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F"   // DAI contract
  }

  // Get ERC-20 token balances
  const { contract: usdcContract } = useContract(tokenContracts.USDC)
  const { contract: usdtContract } = useContract(tokenContracts.USDT)

  // Fetch token balances using Alchemy
  const fetchTokenBalancesWithAlchemy = async () => {
    if (!address || !ALCHEMY_API_KEY || ALCHEMY_API_KEY === 'YOUR_ALCHEMY_API_KEY_HERE') {
      console.log("Address or Alchemy API key not available")
      return
    }
    
    setLoading(true)
    const balances = []
    
    try {
      // Get token balances using Alchemy's getTokenBalances method
      const response = await fetch(ALCHEMY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getTokenBalances',
          params: [
            address,
            Object.values(tokenContracts)
          ]
        })
      })

      const data = await response.json()
      
      if (data.result && data.result.tokenBalances) {
        for (const tokenBalance of data.result.tokenBalances) {
          if (tokenBalance.tokenBalance !== '0x0') {
            // Get token metadata
            const metadataResponse = await fetch(ALCHEMY_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'alchemy_getTokenMetadata',
                params: [tokenBalance.contractAddress]
              })
            })

            const metadata = await metadataResponse.json()
            
            if (metadata.result) {
              const balance = parseInt(tokenBalance.tokenBalance, 16) / Math.pow(10, metadata.result.decimals)
              
              balances.push({
                symbol: metadata.result.symbol,
                balance: balance.toFixed(2),
                contract: tokenBalance.contractAddress,
                name: metadata.result.name
              })
            }
          }
        }
      }

      setTokenBalances(balances)
    } catch (error) {
      console.error("Error fetching token balances with Alchemy:", error)
      setError("Failed to fetch token balances")
    } finally {
      setLoading(false)
    }
  }

  // Fetch transaction history using Alchemy
  const fetchTransactionHistory = async () => {
    if (!address || !ALCHEMY_API_KEY || ALCHEMY_API_KEY === 'YOUR_ALCHEMY_API_KEY_HERE') {
      console.log("Address or Alchemy API key not available")
      setError("Alchemy API key required for transaction history")
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      // Get asset transfers (both incoming and outgoing)
      const response = await fetch(ALCHEMY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getAssetTransfers',
          params: [{
            fromBlock: '0x0',
            toBlock: 'latest',
            fromAddress: address,
            category: ['external', 'token'],
            maxCount: '0x14', // Get last 20 transactions
            order: 'desc'
          }]
        })
      })

      const fromData = await response.json()

      // Get incoming transfers
      const toResponse = await fetch(ALCHEMY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'alchemy_getAssetTransfers',
          params: [{
            fromBlock: '0x0',
            toBlock: 'latest',
            toAddress: address,
            category: ['external', 'token'],
            maxCount: '0x14',
            order: 'desc'
          }]
        })
      })

      const toData = await toResponse.json()

      // Combine and process transactions
      const allTransfers = [
        ...(fromData.result?.transfers || []).map(tx => ({ ...tx, type: 'Sent' })),
        ...(toData.result?.transfers || []).map(tx => ({ ...tx, type: 'Received' }))
      ]

      // Sort by block number (most recent first)
      allTransfers.sort((a, b) => parseInt(b.blockNum, 16) - parseInt(a.blockNum, 16))

      // Process transactions
      const processedTxs = allTransfers.slice(0, 10).map(tx => {
        const value = tx.value || 0
        const symbol = tx.asset || 'ETH'
        
        return {
          hash: tx.hash,
          type: tx.type,
          amount: parseFloat(value).toFixed(4),
          address: tx.type === 'Sent' ? tx.to : tx.from,
          timestamp: new Date(parseInt(tx.metadata?.blockTimestamp || Date.now())).toLocaleDateString(),
          symbol: symbol,
          blockNumber: parseInt(tx.blockNum, 16)
        }
      })
      
      setTransactions(processedTxs)
      
    } catch (error) {
      console.error("Error fetching transactions with Alchemy:", error)
      setError("Failed to fetch transaction history")
    } finally {
      setLoading(false)
    }
  }

  // Alternative method: Get transaction count and latest transactions
  const fetchTransactionHistoryAlternative = async () => {
    if (!address || !ALCHEMY_API_KEY || ALCHEMY_API_KEY === 'YOUR_ALCHEMY_API_KEY_HERE') {
      setError("Alchemy API key required")
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Get latest block number
      const latestBlockResponse = await fetch(ALCHEMY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: []
        })
      })

      const latestBlockData = await latestBlockResponse.json()
      const latestBlock = parseInt(latestBlockData.result, 16)

      // Get transaction count
      const txCountResponse = await fetch(ALCHEMY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'eth_getTransactionCount',
          params: [address, 'latest']
        })
      })

      const txCountData = await txCountResponse.json()
      const txCount = parseInt(txCountData.result, 16)

      console.log(`Address ${address} has ${txCount} transactions`)

      // For now, use the asset transfers method as it's more reliable
      await fetchTransactionHistory()

    } catch (error) {
      console.error("Error in alternative fetch method:", error)
      setError("Failed to fetch transaction data")
      setLoading(false)
    }
  }

  // Fetch token balances
  useEffect(() => {
    if (address) {
      fetchTokenBalancesWithAlchemy()
    } else {
      setTokenBalances([])
    }
  }, [address])

  // Fetch transactions when wallet connects
  useEffect(() => {
    if (address) {
      fetchTransactionHistory()
    } else {
      setTransactions([])
      setTokenBalances([])
    }
  }, [address])

  // Calculate total USD balance (using mock prices)
  const calculateTotalBalance = () => {
    let total = 0
    
    // Add ETH balance (mock price $2000)
    if (ethBalance) {
      total += parseFloat(ethBalance.displayValue) * 2000
    }
    
    // Add token balances (assuming stablecoin = $1)
    tokenBalances.forEach(token => {
      if (token.symbol === 'USDC' || token.symbol === 'USDT' || token.symbol === 'DAI') {
        total += parseFloat(token.balance)
      }
    })
    
    return total.toFixed(2)
  }

  // Get current network info
  const getNetworkInfo = () => {
    // This would typically come from your web3 provider
    return 'Ethereum Mainnet'
  }

  // Sign a message to authenticate
  const signMessage = async () => {
    if (!signer) {
      console.error("Signer not found")
      return
    }

    try {
      const message = "Sign this message to authenticate with Alchemy-powered wallet on Sepolia testnet"
      const signature = await signer.signMessage(message)
      console.log("Signature:", signature)
      alert("Successfully authenticated with wallet signature!")
    } catch (error) {
      console.error("Error signing message:", error)
      alert("Failed to sign message: " + error.message)
    }
  }

  // Shorten wallet address helper
  const formatAddress = (addr) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="max-w-7xl mx-auto p-5">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <img
              src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=50&h=50"
              alt="Profile"
              className="w-12 h-12 rounded-full"
            />
            <div>
              <p className="text-gray-400 text-sm">Welcome,</p>
              <p className="font-semibold text-lg">Lissa</p>
            </div>
          </div>

          {/* Wallet Connection */}
          <div className="text-right">
            {!address ? (
              <ConnectWallet
                theme="dark"
                className="!bg-green-500 !text-white !px-4 !py-2 !rounded-full !text-sm !font-medium"
                btnTitle="Connect Wallet"
              />
            ) : (
              <div>
                <p className="text-green-400 text-sm mb-1 font-semibold">
                  {formatAddress(address)}
                </p>
                <button
                  className="bg-green-700 text-white px-3 py-1 rounded-full text-xs font-medium mr-2"
                  onClick={signMessage}
                >
                  Authenticate
                </button>
                <button
                  className="bg-blue-700 text-white px-3 py-1 rounded-full text-xs font-medium"
                  onClick={fetchTransactionHistory}
                  disabled={loading}
                >
                  <RefreshCw className={`w-3 h-3 inline mr-1 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            )}

            {!address && (
              <p className="text-gray-400 text-xs mt-1">
                New to wallets?{' '}
                <a
                  href="https://www.coinbase.com/wallet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-blue-400"
                >
                  Learn & Create
                </a>
              </p>
            )}
          </div>
        </div>

        {/* API Key Status */}
        {(!ALCHEMY_API_KEY || ALCHEMY_API_KEY === 'YOUR_ALCHEMY_API_KEY_HERE') && (
          <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3 mb-6">
            <p className="text-yellow-300 text-sm">
              ⚠️ Add your Alchemy API key to REACT_APP_ALCHEMY_API_KEY environment variable for real transaction data
            </p>
          </div>
        )}

        {/* AI Command Input */}
        <button 
          onClick={() => onNavigate('voice_chat')}
          className="w-full bg-white/5 rounded-full p-3 mb-6 flex items-center gap-2 border border-white/10"
        >
          <div className="flex-1 flex items-center gap-2">
            <Mic className="w-5 h-5 text-gray-400" />
            <span className="text-gray-400">Use AI to send money now</span>
          </div>
        </button>

        {/* Balance Card */}
        <div className="bg-[#0F1729] rounded-3xl p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-400">Total Balance</p>
            <div className="flex items-center gap-1">
              <span>USD</span>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          
          {address ? (
            <>
              <p className="text-4xl font-bold mb-4">
                {ethLoading || loading ? (
                  <span className="animate-pulse">Loading...</span>
                ) : (
                  `$${calculateTotalBalance()}`
                )}
              </p>
              
              {/* Individual Balances */}
              <div className="space-y-2 mb-4">
                {ethBalance && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">ETH:</span>
                    <span>{parseFloat(ethBalance.displayValue).toFixed(4)} ETH</span>
                  </div>
                )}
                {tokenBalances.map((token, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="text-gray-400">{token.symbol}:</span>
                    <span>{token.balance} {token.symbol}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-4xl font-bold mb-4">Connect Wallet</p>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Network: {getNetworkInfo()}</span>
            <div className="flex -space-x-1">
              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
                ETH
              </div>
            </div>
            {error && (
              <span className="ml-auto text-red-400 text-xs">{error}</span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-4 bg-gradient-to-r from-[#0F1729] to-gray-900/50 backdrop-blur-xl border border-gray-700/50 rounded-full mb-6">
          <button className="flex flex-col items-center gap-2 p-4" onClick={() => onNavigate('receive')}>
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
              <Plus className="w-6 h-6 text-white" />
            </div>
            <span className="text-sm">Receive</span>
          </button>
          <button className="flex flex-col items-center gap-2 p-4" onClick={() => onNavigate('send')}>
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
              <Send className="w-6 h-6 text-white" />
            </div>
            <span className="text-sm">Send</span>
          </button>
          <button className="flex flex-col items-center gap-2 p-4" onClick={() => onNavigate('convert')}>
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
              <ReceiptText className="w-6 h-6 text-white" />
            </div>
            <span className="text-sm">Convert</span>
          </button>
        </div>

        {/* Recent Transactions */}
        <div className="mb-20 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Recent Transactions</h3>
            <button 
              className="text-sm text-gray-400 hover:text-white"
              onClick={fetchTransactionHistory}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          
          {!address ? (
            <p className="text-gray-500 text-center py-8">Connect wallet to view transactions</p>
          ) : loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-700"></div>
                    <div>
                      <div className="h-4 bg-gray-700 rounded w-20 mb-2"></div>
                      <div className="h-3 bg-gray-700 rounded w-32"></div>
                    </div>
                  </div>
                  <div className="h-4 bg-gray-700 rounded w-16"></div>
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No transactions found</p>
          ) : (
            <div className="space-y-4">
              {transactions.map((transaction, index) => (
                <div key={index} className="flex items-center justify-between hover:bg-white/5 p-2 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                      ${transaction.type === 'Sent' ? 'bg-red-500' : 'bg-green-500'}`}>
                      {transaction.type === 'Sent' ? 'S' : 'R'}
                    </div>
                    <div>
                      <p className="font-medium">{transaction.type}</p>
                      <p className="text-sm text-gray-400">
                        {transaction.type === 'Sent' ? 'To' : 'From'} {formatAddress(transaction.address)}
                      </p>
                      <p className="text-xs text-gray-500">{transaction.timestamp}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${transaction.type === 'Sent' ? 'text-red-400' : 'text-green-400'}`}>
                      {transaction.type === 'Sent' ? '-' : '+'}{transaction.amount} {transaction.symbol}
                    </p>
                    <p className="text-xs text-gray-500">Block #{transaction.blockNumber}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-[#0F1729] p-4">
          <div className="max-w-md mx-auto flex justify-between items-center">
            <button className="flex flex-col items-center gap-1">
              <Home className="w-6 h-6" />
              <span className="text-xs">Home</span>
            </button>
            <button className="flex flex-col items-center gap-1">
              <History className="w-6 h-6" />
              <span className="text-xs">History</span>
            </button>
            <button className="flex flex-col items-center gap-1">
              <Bell className="w-6 h-6" />
              <span className="text-xs">Notification</span>
            </button>
            <button className="flex flex-col items-center gap-1">
              <Settings className="w-6 h-6" />
              <span className="text-xs">Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard