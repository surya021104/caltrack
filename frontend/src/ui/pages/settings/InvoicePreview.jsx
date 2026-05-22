import React from 'react'
import { motion } from 'framer-motion'
import { 
  Download, 
  Printer, 
  Share2, 
  CheckCircle2, 
  MapPin, 
  Phone, 
  Globe, 
  Mail,
  Zap
} from 'lucide-react'

const THEMES = {
  modern: {
    primary: '#4F46E5', // Indigo
    bg: 'bg-white',
    text: 'text-slate-900',
    accent: 'bg-indigo-50 text-indigo-700',
    border: 'border-slate-100'
  },
  midnight: {
    primary: '#0F172A', // Slate 900
    bg: 'bg-slate-950',
    text: 'text-white',
    accent: 'bg-slate-900 text-slate-300',
    border: 'border-slate-800'
  },
  emerald: {
    primary: '#059669', // Emerald 600
    bg: 'bg-white',
    text: 'text-slate-900',
    accent: 'bg-emerald-50 text-emerald-700',
    border: 'border-slate-100'
  }
}

export function InvoicePreview({ invoice, company, themeKey = 'modern', setTheme, onClose }) {
  const theme = THEMES[themeKey] || THEMES.modern
  const isDark = themeKey === 'midnight'

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-4xl bg-white dark:bg-slate-950 rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header / Actions */}
        <div className="px-8 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none">
              <Zap size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Preview Invoice</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{invoice.invoice_number}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
              <Printer size={18} />
            </button>
            <button className="p-2.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
              <Share2 size={18} />
            </button>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all">
              <Download size={14} /> Download PDF
            </button>
          </div>
        </div>

        {/* Invoice Body */}
        <div className="flex-1 overflow-y-auto p-12 bg-slate-50 dark:bg-slate-900/50">
          <div className={`mx-auto max-w-3xl ${theme.bg} rounded-[32px] shadow-xl border ${theme.border} overflow-hidden font-sans`}>
            
            {/* Top Branding */}
            <div className="p-12 pb-0 flex justify-between items-start">
              <div>
                <h1 className={`text-4xl font-black ${theme.text} tracking-tighter mb-2`}>INVOICE</h1>
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${theme.accent}`}>
                  <CheckCircle2 size={12} className="mr-2" /> {invoice.status}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-xl font-black ${theme.text}`}>CALTRACK</div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Workforce Systems</div>
              </div>
            </div>

            <div className="p-12 grid grid-cols-2 gap-12">
              {/* Info Columns */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Billed To</p>
                <div className={`text-lg font-black ${theme.text}`}>{company.company_name}</div>
                <p className="text-sm text-slate-500 font-medium leading-relaxed mt-1">
                  Corporate Headquarters<br />
                  123 Innovation Drive<br />
                  Silicon Valley, CA 94043
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Invoice Details</p>
                <div className="space-y-2">
                  <div className="flex justify-end gap-4">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Number:</span>
                    <span className={`text-xs font-black ${theme.text}`}>{invoice.invoice_number}</span>
                  </div>
                  <div className="flex justify-end gap-4">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Date:</span>
                    <span className={`text-xs font-black ${theme.text}`}>{invoice.billing_date}</span>
                  </div>
                  <div className="flex justify-end gap-4">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Due Date:</span>
                    <span className={`text-xs font-black ${theme.text}`}>{invoice.due_date}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="px-12">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-100 dark:border-slate-800">
                    <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
                    <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</th>
                    <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Rate</th>
                    <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-50'}`}>
                  <tr>
                    <td className="py-6">
                      <div className={`text-sm font-black ${theme.text}`}>Enterprise License Subscription</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Professional Tier (Monthly)</div>
                    </td>
                    <td className={`py-6 text-center text-sm font-bold ${theme.text}`}>1</td>
                    <td className={`py-6 text-right text-sm font-bold ${theme.text}`}>${invoice.amount}</td>
                    <td className={`py-6 text-right text-sm font-black ${theme.text}`}>${invoice.amount}</td>
                  </tr>
                  <tr>
                    <td className="py-6">
                      <div className={`text-sm font-black ${theme.text}`}>Advanced Compliance Add-on</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Audit Log + GPS History</div>
                    </td>
                    <td className={`py-6 text-center text-sm font-bold ${theme.text}`}>1</td>
                    <td className={`py-6 text-right text-sm font-bold ${theme.text}`}>$0.00</td>
                    <td className={`py-6 text-right text-sm font-black ${theme.text}`}>$0.00</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="p-12 flex justify-end">
              <div className="w-64 space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Subtotal</span>
                  <span className={`text-xs font-black ${theme.text}`}>${invoice.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Tax (0%)</span>
                  <span className={`text-xs font-black ${theme.text}`}>$0.00</span>
                </div>
                <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Total Amount</span>
                  <span className="text-xl font-black text-indigo-600">${invoice.amount}</span>
                </div>
              </div>
            </div>

            {/* Footer Contact */}
            <div className={`p-12 ${isDark ? 'bg-slate-900' : 'bg-slate-50'} flex justify-between items-center`}>
              <div className="flex gap-6">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Mail size={12} className="text-indigo-500" /> support@caltrack.com
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Globe size={12} className="text-indigo-500" /> caltrack.com
                </div>
              </div>
              <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                Thank you for your business
              </div>
            </div>
          </div>
        </div>

        {/* Theme Picker */}
        <div className="px-8 py-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-6 bg-white dark:bg-slate-900">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Template Theme:</p>
          <div className="flex gap-3">
            {Object.keys(THEMES).map(k => (
              <button 
                key={k}
                onClick={() => setTheme(k)}
                className={`w-6 h-6 rounded-full border-2 ${themeKey === k ? 'border-indigo-600 scale-125' : 'border-transparent'} transition-all`}
                style={{ backgroundColor: THEMES[k].primary }}
              />
            ))}
          </div>
        </div>

      </motion.div>
    </motion.div>
  )
}
