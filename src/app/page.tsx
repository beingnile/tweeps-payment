import MpesaPaymentForm from '@/components/MpesaPaymentForm'
import { Clock, DollarSign, Users } from 'lucide-react'
import { TransactionsManager } from '@/lib/transactions-manager'

export default async function Home() {
  const { totalOrders, totalRevenue } = await TransactionsManager.getDailyStats();
  const transactions = await TransactionsManager.getTransactions();

  const formattedRevenue = totalRevenue.toLocaleString('en-KE', {
    style: 'currency',
    currency: 'KES'
  });

  return (
    <main className="py-10">
      <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
        <div className="px-4 sm:px-0">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Dashboard Overview</h2>
        </div>
        
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { 
              icon: <Clock className="h-6 w-6 text-blue-500" />, 
              title: "Today's Orders", 
              value: totalOrders.toString(),
              bgColor: "bg-blue-50"
            },
            { 
              icon: <DollarSign className="h-6 w-6 text-green-500" />, 
              title: "Total Revenue", 
              value: formattedRevenue,
              bgColor: "bg-green-50"
            },
            { 
              icon: <Users className="h-6 w-6 text-purple-500" />, 
              title: "Active Employees", 
              value: "8",
              bgColor: "bg-purple-50"
            }
          ].map((stat) => (
            <div 
              key={stat.title} 
              className={`${stat.bgColor} overflow-hidden shadow-md rounded-xl transform transition-all duration-300 hover:scale-[1.02]`}
            >
              <div className="p-6 flex items-center">
                <div className="p-3 rounded-full bg-white shadow-md mr-4">
                  {stat.icon}
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {stat.title}
                  </dt>
                  <dd className="text-2xl font-bold text-gray-900">
                    {stat.value}
                  </dd>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid md:grid-cols-2 gap-8">
          <div className="bg-white shadow-xl rounded-xl p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-5">
              Recent Transactions
            </h3>
            <div className="space-y-4">
              {transactions.slice(0, 3).map((transaction) => (
                <div 
                  key={transaction.id} 
                  className="bg-gray-50 rounded-lg p-4 flex justify-between items-center hover:bg-gray-100 transition"
                >
                  <div>
                    <p className="font-medium text-gray-700">Transaction {transaction.id.slice(-6)}</p>
                    <p className="text-sm text-gray-500">
                      {transaction.amount.toLocaleString('en-KE', {
                        style: 'currency',
                        currency: 'KES'
                      })}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    transaction.status === 'Completed' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {transaction.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white shadow-xl rounded-xl p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-5">
              Process Payment
            </h3>
            <MpesaPaymentForm />
          </div>
        </div>
      </div>
    </main>
  )
}
