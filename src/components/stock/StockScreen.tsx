import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  ShoppingCart,
  Camera,
  Plus,
  Minus,
  Search,
  AlertTriangle,
  Calendar as CalendarIcon,
  Tag,
  MapPin,
  Barcode as BarcodeIcon,
  CheckCircle2,
  Circle,
  Trash2,
  Edit3,
  Star,
  Sparkles,
  ArrowRight,
  Filter,
  PlusCircle,
  Layers,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { StockItem, ShoppingListItem, STOCK_CATEGORIES } from '../../types';
import { api } from '../../api/client';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { StockItemModal } from './StockItemModal';
import { ShoppingListModal } from './ShoppingListModal';
import { QuickAdjustModal } from './QuickAdjustModal';
import { format, isPast, isToday, differenceInDays } from 'date-fns';

export const StockScreen: React.FC = () => {
  // Navigation Switcher: 'stock' | 'shopping_list'
  const [internalTab, setInternalTab] = useState<'stock' | 'shopping_list'>('stock');

  // Data state
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search for Stock view
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState<boolean>(false);
  const [filterExpiringSoonOnly, setFilterExpiringSoonOnly] = useState<boolean>(false);
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState<boolean>(false);

  // Filters for Shopping List view
  const [shoppingCategoryFilter, setShoppingCategoryFilter] = useState<string>('ALL');
  const [quickShoppingInput, setQuickShoppingInput] = useState<string>('');

  // Modals state
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [scannerMode, setScannerMode] = useState<'add' | 'use'>('add');

  const [isStockModalOpen, setIsStockModalOpen] = useState<boolean>(false);
  const [editingStockItem, setEditingStockItem] = useState<StockItem | null>(null);
  const [modalInitialBarcode, setModalInitialBarcode] = useState<string | null>(null);

  const [isShoppingModalOpen, setIsShoppingModalOpen] = useState<boolean>(false);
  const [editingShoppingItem, setEditingShoppingItem] = useState<ShoppingListItem | null>(null);

  const [quickAdjustItem, setQuickAdjustItem] = useState<StockItem | null>(null);
  const [quickAdjustMode, setQuickAdjustMode] = useState<'add' | 'use'>('add');

  // Barcode drawer expansion per stock item
  const [expandedBarcodesItemId, setExpandedBarcodesItemId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const [stockData, shoppingData] = await Promise.all([
        api.getStockItems(),
        api.getShoppingList(),
      ]);
      setStockItems(stockData);
      setShoppingList(shoppingData);
    } catch (err: any) {
      console.error('Failed to load stock data:', err);
      setError(err.message || 'Failed to load stock data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // MANDATORY REQUIREMENT: Stock items are ALWAYS sorted A-Z by canonical stock item name
  const sortedStockItems = useMemo(() => {
    return [...stockItems].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [stockItems]);

  // Filtered Stock Items (still strictly preserves A-Z sorting)
  const filteredStockItems = useMemo(() => {
    return sortedStockItems.filter((item) => {
      // Search matching
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesCategory = item.category?.toLowerCase().includes(query);
        const matchesLocation = item.location?.toLowerCase().includes(query);
        const matchesBarcode = item.barcodes?.some(
          (b) => b.barcode.includes(query) || (b.brand_or_label && b.brand_or_label.toLowerCase().includes(query))
        );
        if (!matchesName && !matchesCategory && !matchesLocation && !matchesBarcode) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }

      // Low stock filter
      if (filterLowStockOnly) {
        const threshold = item.low_stock_threshold ?? 1;
        if (item.quantity > threshold) return false;
      }

      // Expiring soon filter (within 7 days or already expired)
      if (filterExpiringSoonOnly) {
        if (!item.earliest_expiry_date) return false;
        const expDate = new Date(item.earliest_expiry_date);
        const diff = differenceInDays(expDate, new Date());
        if (diff > 7) return false;
      }

      // Favorites only
      if (filterFavoritesOnly && !item.is_favorite) {
        return false;
      }

      return true;
    });
  }, [
    sortedStockItems,
    searchQuery,
    selectedCategory,
    filterLowStockOnly,
    filterExpiringSoonOnly,
    filterFavoritesOnly,
  ]);

  // Derived low stock items count
  const lowStockItems = useMemo(() => {
    return stockItems.filter((item) => {
      const threshold = item.low_stock_threshold ?? 1;
      return item.quantity <= threshold;
    });
  }, [stockItems]);

  // Derived expiring soon items count
  const expiringSoonItems = useMemo(() => {
    return stockItems.filter((item) => {
      if (!item.earliest_expiry_date) return false;
      const expDate = new Date(item.earliest_expiry_date);
      const diff = differenceInDays(expDate, new Date());
      return diff <= 7;
    });
  }, [stockItems]);

  // Filtered Shopping List Items
  const filteredShoppingList = useMemo(() => {
    if (shoppingCategoryFilter === 'ALL') return shoppingList;
    return shoppingList.filter((item) => item.category === shoppingCategoryFilter);
  }, [shoppingList, shoppingCategoryFilter]);

  const activeShoppingCount = useMemo(() => {
    return shoppingList.filter((item) => !item.is_completed).length;
  }, [shoppingList]);

  const completedShoppingItems = useMemo(() => {
    return shoppingList.filter((item) => item.is_completed);
  }, [shoppingList]);

  // Quick Action Handlers
  const handleOpenScanner = (mode: 'add' | 'use') => {
    setScannerMode(mode);
    setIsScannerOpen(true);
  };

  const handleCreateNewStockItem = (initialBarcode?: string) => {
    setEditingStockItem(null);
    setModalInitialBarcode(initialBarcode || null);
    setIsStockModalOpen(true);
  };

  const handleEditStockItem = (item: StockItem) => {
    setEditingStockItem(item);
    setModalInitialBarcode(null);
    setIsStockModalOpen(true);
  };

  const handleQuickAddStock = async (item: StockItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.adjustStockQuantity(item.id, {
        action: 'add',
        amount: 1,
      });
      loadData();
    } catch (err: any) {
      alert(`Error adjusting stock: ${err.message}`);
    }
  };

  const handleQuickUseStock = async (item: StockItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.adjustStockQuantity(item.id, {
        action: 'use',
        amount: 1,
      });
      loadData();
    } catch (err: any) {
      alert(`Error adjusting stock: ${err.message}`);
    }
  };

  const handleAddStockItemToShoppingList = async (item: StockItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.addShoppingListItem({
        name: item.name,
        quantity: 1,
        unit: item.unit,
        category: item.category,
        stock_item_id: item.id,
        notes: `Restock pantry (Current: ${item.quantity} ${item.unit})`,
      });
      loadData();
      alert(`Added "${item.name}" to Shopping List!`);
    } catch (err: any) {
      alert(`Error adding to shopping list: ${err.message}`);
    }
  };

  const handleAddAllLowStockToShoppingList = async () => {
    if (lowStockItems.length === 0) return;
    try {
      for (const item of lowStockItems) {
        // Check if already in shopping list (incomplete)
        const alreadyInList = shoppingList.some(
          (s) => !s.is_completed && (s.stock_item_id === item.id || s.name.toLowerCase() === item.name.toLowerCase())
        );
        if (!alreadyInList) {
          await api.addShoppingListItem({
            name: item.name,
            quantity: Math.max(1, (item.low_stock_threshold || 1) * 2 - item.quantity),
            unit: item.unit,
            category: item.category,
            stock_item_id: item.id,
            notes: `Auto low stock replenishment`,
          });
        }
      }
      loadData();
      alert(`Added ${lowStockItems.length} low stock items to your Shopping List!`);
    } catch (err: any) {
      alert(`Error adding low stock items: ${err.message}`);
    }
  };

  // Shopping List item toggling
  const handleToggleShoppingItem = async (itemId: string) => {
    try {
      // Optimistic update
      setShoppingList((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, is_completed: !item.is_completed } : item))
      );
      await api.toggleShoppingListItem(itemId);
      loadData();
    } catch (err: any) {
      console.error('Failed to toggle shopping item:', err);
      loadData();
    }
  };

  const handleQuickAddShoppingItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickShoppingInput.trim()) return;

    try {
      const name = quickShoppingInput.trim();
      setQuickShoppingInput('');

      // Check if matches an existing stock item name
      const matchedStock = stockItems.find((s) => s.name.toLowerCase() === name.toLowerCase());

      await api.addShoppingListItem({
        name,
        quantity: 1,
        unit: matchedStock ? matchedStock.unit : 'packs',
        category: matchedStock ? matchedStock.category : 'Pantry Essentials',
        stock_item_id: matchedStock ? matchedStock.id : null,
      });

      loadData();
    } catch (err: any) {
      alert(`Error adding item: ${err.message}`);
    }
  };

  const handleClearCompletedShoppingList = async () => {
    try {
      await api.clearCompletedShoppingList();
      loadData();
    } catch (err: any) {
      alert(`Error clearing completed items: ${err.message}`);
    }
  };

  const getExpiryBadge = (expiryDateStr?: string | null) => {
    if (!expiryDateStr) return null;
    const expDate = new Date(expiryDateStr);
    const diff = differenceInDays(expDate, new Date());

    if (isPast(expDate) && !isToday(expDate)) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-800 border border-red-200">
          <AlertTriangle className="w-3 h-3 text-red-600" /> Expired
        </span>
      );
    }
    if (diff <= 3) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600" /> Exp in {diff <= 0 ? 'today' : `${diff}d`}
        </span>
      );
    }
    if (diff <= 7) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-yellow-50 text-yellow-800 border border-yellow-200">
          Exp in {diff}d
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 font-medium">
        <CalendarIcon className="w-3 h-3 text-gray-400" /> {format(expDate, 'dd MMM yyyy')}
      </span>
    );
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Dairy & Fridge':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Fresh Produce':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Bakery':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Meat & Seafood':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Frozen':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'Beverages':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Snacks & Sweets':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Household & Cleaning':
        return 'bg-teal-50 text-teal-800 border-teal-200';
      case 'Personal Care':
        return 'bg-pink-50 text-pink-700 border-pink-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div id="stock-screen-container" className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5 pb-24 md:pb-12">
      {/* 1. TOP HEADER & INTERNAL SWITCHER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-3xl border border-gray-200/90 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shadow-2xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight font-serif">
                Pantry & Stock
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                Household inventory with barcode scanning & integrated shopping list
              </p>
            </div>
          </div>
        </div>

        {/* Top internal switcher: Stock vs Shopping List */}
        <div className="flex items-center bg-gray-100/90 p-1.5 rounded-2xl border border-gray-200/80 self-start md:self-center">
          <button
            type="button"
            id="tab-switcher-stock"
            onClick={() => setInternalTab('stock')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              internalTab === 'stock'
                ? 'bg-white text-gray-900 shadow-xs ring-1 ring-black/5'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Package className="w-4 h-4 text-emerald-600" />
            <span>Stock</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
              {stockItems.length}
            </span>
            {lowStockItems.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Low stock items" />
            )}
          </button>

          <button
            type="button"
            id="tab-switcher-shopping-list"
            onClick={() => setInternalTab('shopping_list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              internalTab === 'shopping_list'
                ? 'bg-white text-gray-900 shadow-xs ring-1 ring-black/5'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <ShoppingCart className="w-4 h-4 text-purple-600" />
            <span>Shopping List</span>
            {activeShoppingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                {activeShoppingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 2. PROMINENT ACTIONS BANNER */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Prominent Action 1: Add Stock (Camera / Barcode Scanner) */}
        <button
          type="button"
          id="btn-add-stock-scan"
          onClick={() => handleOpenScanner('add')}
          className="group relative overflow-hidden bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white p-4 rounded-2xl shadow-xs transition-all flex items-center justify-between cursor-pointer border border-emerald-500/30"
        >
          <div className="flex items-center gap-3 z-10">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white shadow-2xs group-hover:scale-105 transition-transform">
              <Camera className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold tracking-tight">Add Stock</div>
              <div className="text-[11px] text-emerald-100 font-medium">Scan barcode to replenish</div>
            </div>
          </div>
          <Plus className="w-5 h-5 text-emerald-200 group-hover:translate-x-0.5 transition-transform z-10" />
        </button>

        {/* Prominent Action 2: Use Stock (Camera / Barcode Scanner) */}
        <button
          type="button"
          id="btn-use-stock-scan"
          onClick={() => handleOpenScanner('use')}
          className="group relative overflow-hidden bg-gradient-to-br from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 text-white p-4 rounded-2xl shadow-xs transition-all flex items-center justify-between cursor-pointer border border-amber-500/30"
        >
          <div className="flex items-center gap-3 z-10">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white shadow-2xs group-hover:scale-105 transition-transform">
              <Camera className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold tracking-tight">Use Stock</div>
              <div className="text-[11px] text-amber-100 font-medium">Scan barcode to deduct</div>
            </div>
          </div>
          <Minus className="w-5 h-5 text-amber-200 group-hover:translate-x-0.5 transition-transform z-10" />
        </button>

        {/* Action 3: New Item Manual Add */}
        <button
          type="button"
          id="btn-new-stock-item-manual"
          onClick={() => handleCreateNewStockItem()}
          className="group relative overflow-hidden bg-white hover:bg-gray-50 text-gray-900 p-4 rounded-2xl border border-gray-200 shadow-2xs transition-all flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs group-hover:scale-105 transition-transform">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold tracking-tight">New Stock Item</div>
              <div className="text-[11px] text-gray-500 font-medium">Add canonical item manually</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* 3. LOW STOCK & EXPIRY NOTIFICATION CARD (If items need attention) */}
      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-950">
                {lowStockItems.length} household item{lowStockItems.length === 1 ? ' is' : 's are'} running low!
              </div>
              <div className="text-[11px] text-amber-800 font-medium">
                {lowStockItems.map((i) => `${i.name} (${i.quantity} ${i.unit})`).slice(0, 4).join(', ')}
                {lowStockItems.length > 4 ? ` and ${lowStockItems.length - 4} more` : ''}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddAllLowStockToShoppingList}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Add all to Shopping List</span>
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4A. TAB 1: STOCK INVENTORY VIEW                          */}
      {/* ======================================================== */}
      {internalTab === 'stock' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Search, Filter Bar & Quick Counters */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  id="stock-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search stock items by name, barcode, location, brand..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3.5 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Category Dropdown */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 font-medium focus:outline-none focus:border-gray-900 cursor-pointer"
              >
                <option value="ALL">All Categories ({stockItems.length})</option>
                {STOCK_CATEGORIES.map((cat) => {
                  const count = stockItems.filter((i) => i.category === cat).length;
                  return (
                    <option key={cat} value={cat}>
                      {cat} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Quick Filter Badges */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
                <Filter className="w-3 h-3 text-gray-400" /> Filter:
              </span>

              <button
                type="button"
                onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  filterLowStockOnly
                    ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Low Stock ({lowStockItems.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterExpiringSoonOnly(!filterExpiringSoonOnly)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  filterExpiringSoonOnly
                    ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <Clock className="w-3 h-3" />
                <span>Expiring Soon ({expiringSoonItems.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterFavoritesOnly(!filterFavoritesOnly)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  filterFavoritesOnly
                    ? 'bg-yellow-500 text-white border-yellow-500 shadow-2xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <Star className="w-3 h-3 fill-current" />
                <span>Favorites</span>
              </button>

              <div className="ml-auto text-[11px] text-gray-400 font-medium">
                Alphabetical Order (A–Z)
              </div>
            </div>
          </div>

          {/* Stock Items Grid / List (MANDATORY REQUIREMENT: ALWAYS A-Z SORTED) */}
          {filteredStockItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredStockItems.map((item) => {
                const isLow = item.quantity <= (item.low_stock_threshold ?? 1);
                const isExpanded = expandedBarcodesItemId === item.id;
                const barcodeCount = item.barcodes?.length || 0;

                return (
                  <div
                    key={item.id}
                    id={`stock-card-${item.id}`}
                    className={`bg-white rounded-2xl border transition-all shadow-2xs flex flex-col justify-between overflow-hidden relative group hover:border-gray-300 ${
                      isLow ? 'border-amber-300/80 bg-amber-50/10' : 'border-gray-200/90'
                    }`}
                  >
                    {/* Top Section */}
                    <div className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 flex-1">
                          <div className="flex items-center gap-1.5">
                            {item.is_favorite && (
                              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />
                            )}
                            <h3 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight leading-snug">
                              {item.name}
                            </h3>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span
                              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${getCategoryColor(
                                item.category || ''
                              )}`}
                            >
                              {item.category}
                            </span>
                            {item.location && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 font-medium bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-md">
                                <MapPin className="w-2.5 h-2.5 text-gray-400" />
                                {item.location}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => handleEditStockItem(item)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                          title="Edit stock item"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Stock Level & Status Display */}
                      <div className="flex items-baseline justify-between pt-1">
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className={`text-2xl font-black tracking-tight ${
                              item.quantity === 0
                                ? 'text-red-600'
                                : isLow
                                ? 'text-amber-600'
                                : 'text-gray-900'
                            }`}
                          >
                            {item.quantity}
                          </span>
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            {item.unit}
                          </span>
                        </div>

                        {/* Status Badges */}
                        <div className="flex items-center gap-1.5">
                          {isLow && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-700" /> Low Stock
                            </span>
                          )}
                          {getExpiryBadge(item.earliest_expiry_date)}
                        </div>
                      </div>

                      {/* Notes snippet if present */}
                      {item.notes && (
                        <p className="text-[11px] text-gray-500 line-clamp-1 italic">
                          {item.notes}
                        </p>
                      )}

                      {/* Barcode mapping summary toggle */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setExpandedBarcodesItemId(isExpanded ? null : item.id)}
                          className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <BarcodeIcon className="w-3 h-3" />
                          <span>
                            {barcodeCount > 0
                              ? `${barcodeCount} barcode${barcodeCount === 1 ? '' : 's'} linked`
                              : 'No barcodes linked'}
                          </span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>

                        {/* Expanded Barcodes list */}
                        {isExpanded && (
                          <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-xl space-y-1 text-[11px] animate-in fade-in">
                            {barcodeCount > 0 ? (
                              item.barcodes?.map((bc) => (
                                <div
                                  key={bc.id}
                                  className="flex items-center justify-between text-gray-700 font-mono"
                                >
                                  <span>{bc.barcode}</span>
                                  {bc.brand_or_label && (
                                    <span className="text-[10px] text-gray-500 font-sans font-medium">
                                      {bc.brand_or_label}
                                    </span>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-[10px] text-gray-400 italic">
                                Scan barcodes with camera to link brands to this item.
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => handleEditStockItem(item)}
                              className="text-[10px] font-bold text-blue-600 hover:underline pt-1 block"
                            >
                              + Manage Barcodes
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Card Controls Footer */}
                    <div className="px-3 py-2.5 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between gap-2">
                      {/* 1-Click Quantity Adjusters */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => handleQuickUseStock(item, e)}
                          className="w-8 h-8 rounded-lg bg-white hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 text-gray-700 border border-gray-200 flex items-center justify-center font-bold text-sm transition-all shadow-2xs cursor-pointer active:scale-95"
                          title={`Use 1 ${item.unit}`}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleQuickAddStock(item, e)}
                          className="w-8 h-8 rounded-lg bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 text-gray-700 border border-gray-200 flex items-center justify-center font-bold text-sm transition-all shadow-2xs cursor-pointer active:scale-95"
                          title={`Add 1 ${item.unit}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Add to Shopping list 1-click */}
                      <button
                        type="button"
                        onClick={(e) => handleAddStockItemToShoppingList(item, e)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-purple-50 text-purple-700 hover:border-purple-300 border border-gray-200 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                        title="Add to Shopping List"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Add to List</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center space-y-3">
              <Package className="w-10 h-10 text-gray-300 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-gray-800">No stock items found</h3>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  {searchQuery
                    ? `No items match "${searchQuery}". Try clearing filters.`
                    : 'Your pantry stock inventory is empty. Add items manually or scan barcodes!'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCreateNewStockItem()}
                className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Item</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 4B. TAB 2: SHOPPING LIST VIEW                            */}
      {/* ======================================================== */}
      {internalTab === 'shopping_list' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Quick Add Shopping Item Input */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs space-y-3">
            <form onSubmit={handleQuickAddShoppingItem} className="flex items-center gap-2">
              <div className="relative flex-1">
                <ShoppingCart className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-500 pointer-events-none" />
                <input
                  type="text"
                  id="quick-shopping-input"
                  value={quickShoppingInput}
                  onChange={(e) => setQuickShoppingInput(e.target.value)}
                  placeholder="Quick add item to buy (e.g. Eggs, Coffee, Oats, Dishwashing Liquid)..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-purple-600 transition-colors font-medium"
                />
              </div>
              <button
                type="submit"
                disabled={!quickShoppingInput.trim()}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 shadow-xs flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </form>

            {/* Category filter & shopping actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-gray-500">Category:</span>
                <select
                  value={shoppingCategoryFilter}
                  onChange={(e) => setShoppingCategoryFilter(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-800 font-medium focus:outline-none focus:border-gray-900 cursor-pointer"
                >
                  <option value="ALL">All ({shoppingList.length})</option>
                  {STOCK_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                {completedShoppingItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearCompletedShoppingList}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Done ({completedShoppingItems.length})</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Shopping List Items */}
          {filteredShoppingList.length > 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs divide-y divide-gray-100 overflow-hidden">
              {filteredShoppingList.map((item) => (
                <div
                  key={item.id}
                  id={`shopping-item-${item.id}`}
                  onClick={() => handleToggleShoppingItem(item.id)}
                  className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-colors cursor-pointer group ${
                    item.is_completed ? 'bg-gray-50/70 hover:bg-gray-100/70' : 'hover:bg-purple-50/20'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {item.is_completed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-300 group-hover:text-purple-600 shrink-0 transition-colors" />
                    )}

                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-bold tracking-tight ${
                            item.is_completed ? 'line-through text-gray-400' : 'text-gray-900'
                          }`}
                        >
                          {item.name}
                        </span>
                        <span className="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
                          {item.quantity} {item.unit}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                        <span className="font-medium text-gray-400">{item.category}</span>
                        {item.stock_item_id && (
                          <span className="inline-flex items-center gap-0.5 text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded text-[10px] font-bold">
                            Pantry Linked
                          </span>
                        )}
                        {item.notes && <span className="italic text-gray-400">"{item.notes}"</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingShoppingItem(item);
                        setIsShoppingModalOpen(true);
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                      title="Edit shopping item"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await api.deleteShoppingListItem(item.id);
                        loadData();
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center space-y-3">
              <ShoppingCart className="w-10 h-10 text-gray-300 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-gray-800">Your shopping list is empty</h3>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  Add items to buy above, or 1-click replenish low stock items from the Stock tab!
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MODALS                                                 */}
      {/* ======================================================== */}

      {/* Interactive Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        initialMode={scannerMode}
        stockItems={sortedStockItems}
        onStockUpdated={loadData}
        onRequestCreateItemWithBarcode={(barcode) => {
          setIsScannerOpen(false);
          handleCreateNewStockItem(barcode);
        }}
      />

      {/* Stock Item Create / Edit Modal */}
      <StockItemModal
        isOpen={isStockModalOpen}
        onClose={() => {
          setIsStockModalOpen(false);
          setEditingStockItem(null);
          setModalInitialBarcode(null);
        }}
        item={editingStockItem}
        initialBarcode={modalInitialBarcode}
        onSaved={loadData}
      />

      {/* Shopping List Create / Edit Modal */}
      <ShoppingListModal
        isOpen={isShoppingModalOpen}
        onClose={() => {
          setIsShoppingModalOpen(false);
          setEditingShoppingItem(null);
        }}
        item={editingShoppingItem}
        stockItems={sortedStockItems}
        onSaved={loadData}
      />

      {/* Quick Adjust Quantity Modal */}
      <QuickAdjustModal
        isOpen={Boolean(quickAdjustItem)}
        onClose={() => setQuickAdjustItem(null)}
        item={quickAdjustItem}
        mode={quickAdjustMode}
        onUpdated={loadData}
      />
    </div>
  );
};
