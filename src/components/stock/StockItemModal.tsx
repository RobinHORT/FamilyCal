import React, { useState, useEffect } from 'react';
import {
  X,
  Trash2,
  Package,
  Layers,
  MapPin,
  Calendar as CalendarIcon,
  AlertTriangle,
  FileText,
  Barcode as BarcodeIcon,
  Plus,
  Star,
  Link,
  Sparkles,
} from 'lucide-react';
import { StockItem, STOCK_CATEGORIES, STOCK_UNITS } from '../../types';
import { api } from '../../api/client';

interface StockItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: StockItem | null;
  initialBarcode?: string | null;
  onSaved: () => void;
}

export const StockItemModal: React.FC<StockItemModalProps> = ({
  isOpen,
  onClose,
  item,
  initialBarcode,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState(STOCK_CATEGORIES[0]);
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState('packs');
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(1);
  const [restockTarget, setRestockTarget] = useState<number>(2);
  const [autoAddToShopping, setAutoAddToShopping] = useState<boolean>(true);
  const [earliestExpiryDate, setEarliestExpiryDate] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [isFavorite, setIsFavorite] = useState<boolean>(false);

  // Initial barcode mapping when creating
  const [newBarcode, setNewBarcode] = useState('');
  const [newBarcodeLabel, setNewBarcodeLabel] = useState('');

  // Additional barcode attachment form for existing item
  const [additionalBarcode, setAdditionalBarcode] = useState('');
  const [additionalBrandLabel, setAdditionalBrandLabel] = useState('');
  const [isAddingBarcode, setIsAddingBarcode] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (item) {
      setName(item.name);
      setCategory(item.category || STOCK_CATEGORIES[0]);
      setQuantity(item.quantity);
      setUnit(item.unit || 'packs');
      setLowStockThreshold(item.low_stock_threshold ?? 1);
      setRestockTarget(item.restock_target ?? Math.max(2, (item.low_stock_threshold ?? 1) * 2));
      setAutoAddToShopping(item.auto_add_to_shopping !== false && item.auto_add_to_shopping !== 0);
      setEarliestExpiryDate(item.earliest_expiry_date || '');
      setLocation(item.location || '');
      setNotes(item.notes || '');
      setIsFavorite(Boolean(item.is_favorite));
      setNewBarcode('');
      setNewBarcodeLabel('');
    } else {
      setName('');
      setCategory(STOCK_CATEGORIES[0]);
      setQuantity(1);
      setUnit('packs');
      setLowStockThreshold(1);
      setRestockTarget(2);
      setAutoAddToShopping(true);
      setEarliestExpiryDate('');
      setLocation('Pantry');
      setNotes('');
      setIsFavorite(false);
      setNewBarcode(initialBarcode || '');
      setNewBarcodeLabel('');
    }
    setAdditionalBarcode('');
    setAdditionalBrandLabel('');
    setError(null);
  }, [isOpen, item, initialBarcode]);

  if (!isOpen) return null;

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
        // Update existing item
        await api.updateStockItem(item.id, {
          name: name.trim(),
          category,
          quantity,
          unit,
          low_stock_threshold: lowStockThreshold,
          restock_target: restockTarget,
          auto_add_to_shopping: autoAddToShopping,
          earliest_expiry_date: earliestExpiryDate || null,
          location: location || null,
          notes: notes || null,
          is_favorite: isFavorite,
        });
      } else {
        // Create new item
        await api.createStockItem({
          name: name.trim(),
          category,
          quantity,
          unit,
          low_stock_threshold: lowStockThreshold,
          restock_target: restockTarget,
          auto_add_to_shopping: autoAddToShopping,
          earliest_expiry_date: earliestExpiryDate || null,
          location: location || null,
          notes: notes || null,
          is_favorite: isFavorite,
          barcode: newBarcode.trim() || undefined,
          brand_or_label: newBarcodeLabel.trim() || undefined,
        });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save stock item');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!confirm(`Are you sure you want to delete "${item.name}" from your stock inventory?`)) return;

    setIsSubmitting(true);
    try {
      await api.deleteStockItem(item.id);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete stock item');
      setIsSubmitting(false);
    }
  };

  const handleAddBarcode = async () => {
    if (!item || !additionalBarcode.trim()) return;
    setIsAddingBarcode(true);
    try {
      await api.addBarcodeMapping(
        item.id,
        additionalBarcode.trim(),
        additionalBrandLabel.trim() || undefined
      );
      setAdditionalBarcode('');
      setAdditionalBrandLabel('');
      onSaved();
    } catch (err: any) {
      alert(`Error linking barcode: ${err.message}`);
    } finally {
      setIsAddingBarcode(false);
    }
  };

  const handleDeleteBarcode = async (barcodeId: string) => {
    try {
      await api.deleteBarcodeMapping(barcodeId);
      onSaved();
    } catch (err: any) {
      alert(`Error deleting barcode: ${err.message}`);
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
        id="stock-item-modal-dialog"
        className="relative bg-white border border-gray-200 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[92vh] overflow-y-auto"
      >
        {/* Mobile Drag Indicator Bar */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shadow-2xs">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight font-serif">
                {item ? 'Edit Stock Item' : 'New Stock Item'}
              </h3>
              <p className="text-[11px] text-gray-500 font-medium">
                Canonical household inventory item (sorted A–Z)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsFavorite(!isFavorite)}
              className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                isFavorite
                  ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title={isFavorite ? 'Unmark Favorite' : 'Mark as Staple Favorite'}
            >
              <Star className={`w-5 h-5 ${isFavorite ? 'fill-amber-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Canonical Name */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Canonical Item Name *
            </label>
            <input
              id="stock-item-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Milk, Eggs, Sourdough Bread, Penne Pasta..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 transition-colors font-medium"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Use a generic canonical name. Multiple brands/barcodes can map to this single item.
            </p>
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

          {/* Quantity & Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Current Quantity
              </label>
              <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(0, Number(q) - 1))}
                  className="px-3 py-2 text-gray-600 hover:bg-gray-200/80 font-bold text-sm cursor-pointer"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-transparent text-center font-bold text-sm text-gray-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Number(q) + 1)}
                  className="px-3 py-2 text-gray-600 hover:bg-gray-200/80 font-bold text-sm cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Unit of Measure
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 font-medium focus:outline-none focus:border-gray-900 cursor-pointer h-[38px]"
              >
                {STOCK_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Low Stock Alert Threshold & Restock Target */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Low Stock Alert At
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(Math.max(0, Number(e.target.value)))}
                placeholder="1"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-blue-500" /> Restock Target
              </label>
              <input
                type="number"
                min="1"
                step="any"
                value={restockTarget}
                onChange={(e) => setRestockTarget(Math.max(1, Number(e.target.value)))}
                placeholder="2"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900 font-medium"
              />
            </div>
          </div>

          {/* Auto-Add to Shopping List Toggle */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-purple-50/60 border border-purple-100">
            <div>
              <span className="text-xs font-bold text-purple-900 block">Auto-add to Shopping List</span>
              <span className="text-[10px] text-purple-700 font-medium">
                When stock falls to/below {lowStockThreshold}, automatically calculate needed restock ({Math.max(1, restockTarget - lowStockThreshold)} {unit})
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoAddToShopping}
                onChange={(e) => setAutoAddToShopping(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          {/* Location & Expiry Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-gray-500" /> Storage Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Fridge, Top Shelf..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900 placeholder-gray-400 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <CalendarIcon className="w-3.5 h-3.5 text-gray-500" /> Earliest Expiry
              </label>
              <input
                type="date"
                value={earliestExpiryDate}
                onChange={(e) => setEarliestExpiryDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900 cursor-pointer font-medium"
              />
            </div>
          </div>

          {/* Barcode Section for NEW item */}
          {!item && (
            <div className="p-3.5 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <BarcodeIcon className="w-3.5 h-3.5 text-blue-600" /> Initial Barcode Link (Optional)
                </span>
                <span className="text-[10px] text-blue-600 font-medium">Auto-mapped</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newBarcode}
                  onChange={(e) => setNewBarcode(e.target.value)}
                  placeholder="Barcode (e.g. 9300601234567)"
                  className="bg-white border border-blue-200 rounded-xl px-3 py-1.5 text-xs text-gray-900 font-mono focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={newBarcodeLabel}
                  onChange={(e) => setNewBarcodeLabel(e.target.value)}
                  placeholder="Brand / Label (e.g. Coles 2L)"
                  className="bg-white border border-blue-200 rounded-xl px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Linked Barcodes Manager for EXISTING item */}
          {item && (
            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <BarcodeIcon className="w-4 h-4 text-blue-600" /> Linked Barcodes ({item.barcodes?.length || 0})
                </span>
                <span className="text-[10px] text-gray-500 font-medium">
                  Scan any of these to add/use this item
                </span>
              </div>

              {item.barcodes && item.barcodes.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {item.barcodes.map((bc) => (
                    <div
                      key={bc.id}
                      className="flex items-center justify-between bg-white border border-gray-200/90 rounded-xl px-3 py-2 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2">
                        <BarcodeIcon className="w-3.5 h-3.5 text-gray-400" />
                        <div>
                          <span className="font-mono font-bold text-gray-900">{bc.barcode}</span>
                          {bc.brand_or_label && (
                            <span className="text-[11px] text-gray-500 ml-2 font-sans font-medium">
                              ({bc.brand_or_label})
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteBarcode(bc.id)}
                        className="text-gray-400 hover:text-red-600 p-1 rounded-lg transition-colors cursor-pointer"
                        title="Remove barcode mapping"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No barcodes linked yet.</p>
              )}

              {/* Add another barcode row */}
              <div className="pt-2 border-t border-gray-200 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Barcode number"
                  value={additionalBarcode}
                  onChange={(e) => setAdditionalBarcode(e.target.value)}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-gray-900 focus:outline-none focus:border-gray-900"
                />
                <input
                  type="text"
                  placeholder="Brand / Label (optional)"
                  value={additionalBrandLabel}
                  onChange={(e) => setAdditionalBrandLabel(e.target.value)}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
                />
                <button
                  type="button"
                  onClick={handleAddBarcode}
                  disabled={!additionalBarcode.trim() || isAddingBarcode}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center justify-center gap-1 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Link</span>
                </button>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-gray-500" /> Notes & Dietary Details
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Gluten-free, favorite brand, recipe staple..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 resize-none"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            {item ? (
              <button
                type="button"
                id="stock-delete-btn"
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
                id="stock-save-btn"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : item ? 'Update Item' : 'Create Stock Item'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
