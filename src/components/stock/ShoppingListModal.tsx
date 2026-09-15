import React, { useState, useEffect } from 'react';
import {
  X,
  ShoppingCart,
  Layers,
  FileText,
  Link,
  Trash2,
} from 'lucide-react';
import { ShoppingListItem, StockItem, STOCK_CATEGORIES, STOCK_UNITS } from '../../types';
import { api } from '../../api/client';

interface ShoppingListModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ShoppingListItem | null;
  stockItems: StockItem[];
  onSaved: () => void;
}

export const ShoppingListModal: React.FC<ShoppingListModalProps> = ({
  isOpen,
  onClose,
  item,
  stockItems,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState('packs');
  const [category, setCategory] = useState(STOCK_CATEGORIES[0]);
  const [stockItemId, setStockItemId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (item) {
      setName(item.name);
      setQuantity(item.quantity || 1);
      setUnit(item.unit || 'packs');
      setCategory(item.category || STOCK_CATEGORIES[0]);
      setStockItemId(item.stock_item_id || '');
      setNotes(item.notes || '');
    } else {
      setName('');
      setQuantity(1);
      setUnit('packs');
      setCategory(STOCK_CATEGORIES[0]);
      setStockItemId('');
      setNotes('');
    }
    setError(null);
  }, [isOpen, item]);

  if (!isOpen) return null;

  const handleStockItemSelect = (selectedId: string) => {
    setStockItemId(selectedId);
    if (selectedId) {
      const found = stockItems.find((s) => s.id === selectedId);
      if (found) {
        setName(found.name);
        setCategory(found.category || STOCK_CATEGORIES[0]);
        setUnit(found.unit || 'packs');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Item name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (item) {
        await api.updateShoppingListItem(item.id, {
          name: name.trim(),
          quantity,
          unit,
          category,
          stock_item_id: stockItemId || null,
          notes: notes || null,
        });
      } else {
        await api.addShoppingListItem({
          name: name.trim(),
          quantity,
          unit,
          category,
          stock_item_id: stockItemId || null,
          notes: notes || null,
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save shopping item');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    setIsSubmitting(true);
    try {
      await api.deleteShoppingListItem(item.id);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete shopping item');
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
        id="shopping-item-modal-dialog"
        className="relative bg-white border border-gray-200 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[92vh] overflow-y-auto"
      >
        {/* Mobile Drag Indicator Bar */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center shadow-2xs">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight font-serif">
                {item ? 'Edit Shopping Item' : 'Add Shopping Item'}
              </h3>
              <p className="text-[11px] text-gray-500 font-medium">
                Add groceries or household supplies to buy
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
          {/* Link to Existing Stock Item Option */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <Link className="w-3.5 h-3.5 text-blue-600" /> Replenish Existing Stock Item (Optional)
            </label>
            <select
              value={stockItemId}
              onChange={(e) => handleStockItemSelect(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 font-medium focus:outline-none focus:border-gray-900 cursor-pointer"
            >
              <option value="">Custom Item / Not Linked</option>
              {stockItems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (Current: {s.quantity} {s.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Item Name */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Item Name *
            </label>
            <input
              id="shopping-item-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Greek Yoghurt, Pink Lady Apples, Toilet Paper..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 font-medium"
            />
          </div>

          {/* Quantity & Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Quantity to Buy
              </label>
              <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 py-2 text-gray-600 hover:bg-gray-200/80 font-bold text-sm cursor-pointer"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-transparent text-center font-bold text-sm text-gray-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="px-3 py-2 text-gray-600 hover:bg-gray-200/80 font-bold text-sm cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 font-medium focus:outline-none focus:border-gray-900 cursor-pointer h-[38px]"
              >
                {STOCK_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-gray-500" /> Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 font-medium focus:outline-none focus:border-gray-900 cursor-pointer"
            >
              {STOCK_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-gray-500" /> Notes / Brand Preference
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Buy 2 if on special, only organic..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            {item ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
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
                className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : item ? 'Update Item' : 'Add to List'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
