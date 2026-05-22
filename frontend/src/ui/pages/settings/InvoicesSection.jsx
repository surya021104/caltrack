import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { apiRequest } from "../../../api/client.js"
import { Card } from "../../components/kit.jsx"
import { 
  FileText, 
  Download, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ExternalLink,
  Loader2,
  Filter,
  DollarSign,
  Eye
} from "lucide-react"
import { useAuth } from "../../../state/auth/useAuth.js"
import { InvoicePreview } from "./InvoicePreview.jsx"
import { AnimatePresence } from "framer-motion"

const STATUS_CONFIG = {
  paid: { 
    label: "Paid", 
    color: "bg-emerald-50 text-emerald-600 border-emerald-100", 
    icon: <CheckCircle2 size={12} className="mr-1" />,
    pill: "bg-emerald-500"
  },
  pending: { 
    label: "Pending", 
    color: "bg-amber-50 text-amber-600 border-amber-100", 
    icon: <Clock size={12} className="mr-1" />,
    pill: "bg-amber-500"
  },
  overdue: { 
    label: "Overdue", 
    color: "bg-rose-50 text-rose-600 border-rose-100", 
    icon: <AlertCircle size={12} className="mr-1" />,
    pill: "bg-rose-500"
  }
}

export default function InvoicesSection() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [activeTheme, setActiveTheme] = useState('modern')

  useEffect(() => {
    fetchInvoices()
  }, [])

  const fetchInvoices = async () => {
    try {
      setLoading(true)
      const res = await apiRequest("/settings/invoices/")
      setInvoices(res.data || [])
    } catch (err) {
      setError("Failed to load invoices. Please check your billing permissions.")
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = (invoice) => {
    // In a real app, this would open the PDF URL
    window.open(invoice.pdf_url, '_blank')
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-pulse">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <p className="text-slate-400 font-medium">Retrieving your billing history...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fadeUp">
      
      {/* ── Overview Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <DollarSign size={80} />
          </div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Current Balance</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">$0.00</span>
            <span className="text-xs font-bold text-emerald-500">All caught up</span>
          </div>
        </div>
        
        <div className="p-6 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Next Billing Date</p>
          <div className="text-xl font-black text-slate-900 dark:text-white">June 15, 2026</div>
        </div>

        <div className="p-6 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total Spent</p>
          <div className="text-xl font-black text-slate-900 dark:text-white">
            ${invoices.reduce((acc, inv) => acc + parseFloat(inv.amount), 0).toFixed(2)}
          </div>
        </div>
      </div>

      <Card 
        title={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <FileText className="text-indigo-500" size={20} />
              <span>Billing History</span>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition-colors">
              <Filter size={14} /> Filter
            </button>
          </div>
        }
      >
        {invoices.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-950 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-slate-200 dark:border-slate-800">
              <FileText className="text-slate-300" size={24} />
            </div>
            <h3 className="text-slate-900 dark:text-white font-black text-lg mb-1">No invoices found</h3>
            <p className="text-slate-500 text-sm max-w-[280px] mx-auto">You haven't been billed for any premium services yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-50 dark:border-slate-800/50">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Invoice</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Billing Date</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Amount</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
                  <th className="px-6 py-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {invoices.map((invoice, idx) => {
                  const config = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.pending
                  return (
                    <motion.tr 
                      key={invoice.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors"
                    >
                      <td className="px-6 py-5">
                        <div className="font-black text-slate-900 dark:text-white text-sm">{invoice.invoice_number}</div>
                        <div className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-1">SUBSCRIPTION</div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-sm font-bold text-slate-600 dark:text-slate-400">
                          {new Date(invoice.billing_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-sm font-black text-slate-900 dark:text-white">${invoice.amount}</div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${config.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-2 ${config.pill}`} />
                          {config.label}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => setSelectedInvoice(invoice)}
                            className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 transition-all shadow-sm opacity-0 group-hover:opacity-100"
                          >
                            <Eye size={16} />
                          </button>
                          <button 
                            onClick={() => handleDownload(invoice)}
                            className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 transition-all shadow-sm opacity-0 group-hover:opacity-100"
                          >
                            <Download size={16} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Invoice Preview Modal ── */}
      <AnimatePresence>
        {selectedInvoice && (
          <InvoicePreview 
            invoice={selectedInvoice}
            company={{ company_name: user?.companyName || 'My Company' }}
            themeKey={activeTheme}
            setTheme={setActiveTheme}
            onClose={() => setSelectedInvoice(null)}
          />
        )}
      </AnimatePresence>

      <div className="p-8 bg-indigo-600 rounded-[32px] text-white relative overflow-hidden shadow-2xl shadow-indigo-200 dark:shadow-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <h3 className="text-xl font-black mb-2">Need a custom plan?</h3>
            <p className="text-indigo-100 text-sm font-medium opacity-80">Our enterprise solutions offer volume discounts and custom compliance reporting.</p>
          </div>
          <button className="px-8 py-4 bg-white text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-xl whitespace-nowrap">
            Contact Sales
          </button>
        </div>
      </div>

    </div>
  )
}
