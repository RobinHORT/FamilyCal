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
  Clock,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { StockItem, ShoppingTriggerMode, STOCK_CATEGORIES, STOCK_UNITS } from '../../types';
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
  const [targetStock, setTargetStock] = useState<number>(2);
  const [shoppingTrigger, setShoppingTrigger] = useState<ShoppingTriggerMode>('low_stock');
  const [expiryDaysThreshold, setExpiryDaysThreshold] = useState<number>(2);
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
      setTargetStock(item.target_stock ?? item.restock_target ?? Math.max(2, (item.low_stock_threshold ?? 1) * 2));
      const initialTrigger: ShoppingTriggerMode = item.shopping_trigger || (item.auto_add_to_shopping === 0 || item.auto_add_to_shopping === false ? 'none' : 'low_stock');
      setShoppingTrigger(initialTrigger);
      setExpiryDaysThreshold(item.expiry_days_threshold ?? 2);
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
      setTargetStock(2);
      setShoppingTrigger('low_stock');
      setExpiryDaysThreshold(2);
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
          target_stock: targetStock,
          restock_target: targetStock,
          shopping_trigger: shoppingTrigger,
          expiry_days_threshold: expiryDaysThreshold,
          auto_add_to_shopping: shoppingTrigger !== 'none',
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
          target_stock: targetStock,
          restock_target: targetStock,
          shopping_trigger: shoppingTrigger,
          expiry_days_threshold: expiryDaysThreshold,
          auto_add_to_shopping: shoppingTrigger !== 'none',
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

          {/* Opened Stock Items Manager */}
          {item && item.opened_items && item.opened_items.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-amber-700" /> Opened Stock ({item.opened_quantity || 0} {unit})
                </span>
                <span className="text-[10px] text-amber-800 font-medium">Currently in use</span>
              </div>
              <div className="space-y-1.5">
                {item.opened_items.map((opn) => (
                  <div key={opn.id} className="flex items-center justify-between bg-white border border-amber-200/60 rounded-xl px-3 py-2 text-xs shadow-2xs">
                    <div>
                      <span className="font-bold text-gray-900">{opn.quantity} {unit} opened</span>
                      {opn.expiry_date && (
                        <span className="text-gray-600 font-medium ml-2">
                          (expires {opn.expiry_date})
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await api.adjustStockQuantity(item.id, {
                            action: 'consume_opened',
                            amount: opn.quantity,
                            opened_item_id: opn.id,
                          });
                          onSaved();
                        } catch (err: any) {
                          alert(err.message || 'Failed to finish opened item');
                        }
                      }}
                      className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Finish / Consumed
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Target Stock & Low Stock Threshold */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-blue-500" /> Target Stock *
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={targetStock}
                onChange={(e) => setTargetStock(Math.max(0, Number(e.target.value)))}
                placeholder="2"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900 font-medium"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Quantity to keep on hand</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Low-Stock Threshold
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
              <p className="text-[10px] text-gray-400 mt-0.5">Triggers restock when ≤ this</p>
            </div>
          </div>

          {/* Shopping Trigger Configuration */}
          <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-purple-600" /> Shopping List Trigger
              </label>
              <span className="text-[10px] font-semibold text-purple-700 uppercase tracking-wider">
                Automated Replenishment
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-purple-900 mb-1">Trigger Condition</label>
                <select
                  value={shoppingTrigger}
                  onChange={(e) => setShoppingTrigger(e.target.value as ShoppingTriggerMode)}
                  className="w-full bg-white border border-purple-200 rounded-xl px-3 py-1.5 text-xs text-gray-900 font-medium focus:outline-none focus:border-purple-600 cursor-pointer h-[34px]"
                >
                  <option value="low_stock">Low Stock (≤ {lowStockThreshold} {unit})</option>
                  <option value="zero_stock">Zero-Stock Mode (reaches 0)</option>
                  <option value="before_expiry">Before Expiry Date</option>
                  <option value="low_stock_and_expiry">Low Stock OR Before Expiry</option>
                  <option value="none">None (Manual tracking only)</option>
                </select>
              </div>

              {(shoppingTrigger === 'before_expiry' || shoppingTrigger === 'low_stock_and_expiry') ? (
                <div>
                  <label className="block text-[11px] font-semibold text-purple-900 mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-purple-600" /> Days Before Expiry
                  </label>
                  <div className="flex items-center bg-white border border-purple-200 rounded-xl px-3 py-1.5 h-[34px]">
                    <input
                      type="number"
                      min="0"
                      max="90"
                      value={expiryDaysThreshold}
                      onChange={(e) => setExpiryDaysThreshold(Math.max(0, Number(e.target.value)))}
                      className="w-full text-xs text-gray-900 font-bold focus:outline-none"
                    />
                    <span className="text-[11px] text-purple-700 font-medium pl-1">days</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center text-[11px] text-purple-700 bg-white/70 border border-purple-100 rounded-xl px-3 py-1.5 h-[34px]">
                  {shoppingTrigger === 'low_stock' && `Triggers when quantity ≤ ${lowStockThreshold}`}
                  {shoppingTrigger === 'zero_stock' && 'Triggers when quantity reaches 0'}
                  {shoppingTrigger === 'none' && 'Item will not auto-add to shopping list'}
                </div>
              )}
            </div>

            {/* Live Calculation Formula Explanation */}
            <div className="bg-white/80 border border-purple-100 rounded-xl p-2.5 text-[11px] space-y-1">
              <div className="text-purple-900 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                <span>Replenishment Rule:</span>
              </div>
              <div className="text-purple-800 text-[10.5px] leading-relaxed">
                {shoppingTrigger === 'low_stock' && (
                  <>
                    When stock falls to/below <span className="font-bold">{lowStockThreshold} {unit}</span>, Shopping List requires <span className="font-bold text-purple-950">{Math.max(1, targetStock - lowStockThreshold)} {unit}</span> (Target {targetStock} - Current).
                  </>
                )}
                {shoppingTrigger === 'zero_stock' && (
                  <>
                    When stock reaches <span className="font-bold">0</span>, Shopping List automatically adds <span className="font-bold text-purple-950">{targetStock} {unit}</span> (full Target Stock).
                  </>
                )}
                {shoppingTrigger === 'before_expiry' && (
                  <>
                    When within <span className="font-bold">{expiryDaysThreshold} days</span> of expiry ({earliestExpiryDate || 'date set'}), adds <span className="font-bold text-purple-950">{Math.max(1, targetStock > quantity ? targetStock - quantity : targetStock)} {unit}</span> to Shopping List while keeping Stock intact.
                  </>
                )}
                {shoppingTrigger === 'low_stock_and_expiry' && (
                  <>
                    Either low stock (≤ <span className="font-bold">{lowStockThreshold}</span>) OR expiring within <span className="font-bold">{expiryDaysThreshold} days</span> adds <span className="font-bold text-purple-950">{Math.max(1, targetStock - quantity)} {unit}</span> to Shopping List (single canonical entry).
                  </>
                )}
                {shoppingTrigger === 'none' && (
                  <>
                    Manual tracking only. This item will not be automatically generated on the household Shopping List.
                  </>
                )}
              </div>
              <p className="text-[10px] text-gray-500 pt-0.5 border-t border-purple-100/60">
                Ticking an item in Shopping List marks it as purchased. Adding stock physically confirms and updates inventory.
              </p>
            </div>
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
