import React, { useState } from 'react';
import {
  X,
  Plus,
  Minus,
  CheckCircle,
  Package,
} from 'lucide-react';
import { StockItem } from '../../types';
import { api } from '../../api/client';

interface QuickAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: StockItem | null;
  mode: 'add' | 'use';
  onUpdated: () => void;
}

export const QuickAdjustModal: React.FC<QuickAdjustModalProps> = ({
  isOpen,
  onClose,
  item,
  mode,
  onUpdated,
}) => {
  const [amount, setAmount] = useState<number>(1);
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen && item) {
      setAmount(1);
      setExpiryDate(item.earliest_expiry_date || '');
      setError(null);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await api.adjustStockQuantity(item.id, {
        action: mode === 'add' ? 'add' : 'use',
        amount,
        expiry_date: expiryDate || undefined,
      });
      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to adjust quantity');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="quick-adjust-modal-dialog"
        className="relative bg-white border border-gray-200 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95"
      >
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-3 sm:hidden" />

        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-2xs ${
                mode === 'add' ? 'bg-emerald-600' : 'bg-amber-600'
              }`}
            >
              {mode === 'add' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight font-serif">
                {mode === 'add' ? `Add "${item.name}"` : `Use "${item.name}"`}
              </h3>
              <p className="text-[11px] text-gray-500 font-medium">
                Current in stock: <span className="font-bold text-gray-900">{item.quantity} {item.unit}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Quantity to {mode === 'add' ? 'Add' : 'Use'} ({item.unit})
            </label>
            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setAmount((a) => Math.max(1, a - 1))}
                className="w-12 h-12 flex items-center justify-center text-gray-700 hover:bg-gray-200 rounded-xl text-lg font-bold cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                step="any"
                value={amount}
                onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))}
                className="flex-1 bg-transparent text-center font-bold text-xl text-gray-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setAmount((a) => a + 1)}
                className="w-12 h-12 flex items-center justify-center text-gray-700 hover:bg-gray-200 rounded-xl text-lg font-bold cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Quick selector chips */}
            <div className="flex items-center justify-center gap-2 mt-2">
              {[1, 2, 3, 5].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    amount === preset
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {preset} {item.unit}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {mode === 'add' ? 'Expiry Date of Newly Added Item (Optional)' : 'Expiry Date (Optional)'}
            </label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900 cursor-pointer font-medium"
            />
            {item.earliest_expiry_date && (
              <p className="text-[11px] text-gray-500 mt-1">
                Existing registered expiry: <strong>{item.earliest_expiry_date}</strong> (preserved unless modified).
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 rounded-xl text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 ${
                mode === 'add'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {isSubmitting ? 'Updating...' : mode === 'add' ? `Add ${amount} ${item.unit}` : `Use ${amount} ${item.unit}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
