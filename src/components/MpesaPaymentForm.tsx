'use client'

import { useState } from 'react'
import { MpesaPaymentRequest } from '@/types'

export default function MpesaPaymentForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState({
    phoneNumber: '',
    amount: '',
  })

  // Phone number validation
  const validatePhoneNumber = (phone: string) => {
    const phoneRegex = /^(254|0)\d{9}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }

  // Amount validation
  const validateAmount = (amount: string) => {
    const numAmount = Number(amount);
    return !isNaN(numAmount) && numAmount >= 10 && numAmount <= 150000;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    // Validate inputs
    if (!validatePhoneNumber(formData.phoneNumber)) {
      setError('Invalid phone number. Use 254XXXXXXXXX or 0XXXXXXXXX format.');
      setLoading(false);
      return;
    }

    if (!validateAmount(formData.amount)) {
      setError('Invalid amount. Must be between 10 and 150,000 KES.');
      setLoading(false);
      return;
    }

    // Normalize phone number
    const normalizedPhone = formData.phoneNumber.startsWith('0') 
      ? `254${formData.phoneNumber.slice(1)}` 
      : formData.phoneNumber;

    const paymentData: MpesaPaymentRequest = {
      phoneNumber: normalizedPhone,
      amount: Number(formData.amount),
      accountReference: `ORDER-${Date.now()}`,
      transactionDesc: 'Payment for order'
    }

    try {
      const response = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentData)
      })

      if (!response.ok) throw new Error('Payment initiation failed');

      setSuccess(true);
      // Reset form
      setFormData({ phoneNumber: '', amount: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-2">
          Phone Number
        </label>
        <div className="relative rounded-md shadow-sm">
          <input
            type="tel"
            name="phoneNumber"
            id="phoneNumber"
            value={formData.phoneNumber}
            onChange={handleInputChange}
            className="block w-full px-4 py-3 pr-10 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-base"
            placeholder="254XXXXXXXXX or 0XXXXXXXXX"
            required
            aria-invalid={!validatePhoneNumber(formData.phoneNumber)}
            aria-describedby="phone-error"
          />
        </div>
        {!validatePhoneNumber(formData.phoneNumber) && formData.phoneNumber && (
          <p className="mt-2 text-sm text-red-600" id="phone-error">
            Please enter a valid Kenyan phone number
          </p>
        )}
      </div>

      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
          Amount (KES)
        </label>
        <div className="relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-500 sm:text-base">KES</span>
          </div>
          <input
            type="number"
            name="amount"
            id="amount"
            value={formData.amount}
            onChange={handleInputChange}
            className="block w-full pl-16 px-4 py-3 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-base"
            min="10"
            max="150000"
            required
            aria-invalid={!validateAmount(formData.amount)}
            aria-describedby="amount-error"
          />
        </div>
        {!validateAmount(formData.amount) && formData.amount && (
          <p className="mt-2 text-sm text-red-600" id="amount-error">
            Amount must be between 10 and 150,000 KES
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-700">
                Payment initiated successfully. Please check your phone for the STK push.
              </p>
            </div>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !validatePhoneNumber(formData.phoneNumber) || !validateAmount(formData.amount)}
        className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-[#f2ae2a] hover:bg-[#4d200b] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f2ae2a] transition-all duration-300 ease-in-out ${
          (loading || !validatePhoneNumber(formData.phoneNumber) || !validateAmount(formData.amount)) 
            ? 'opacity-50 cursor-not-allowed' 
            : 'hover:scale-[1.02]'
        }`}
      >
        {loading ? 'Processing...' : 'Pay with M-Pesa'}
      </button>
    </form>
  )
}
