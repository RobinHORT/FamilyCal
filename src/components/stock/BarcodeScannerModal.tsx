import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  X,
  Camera,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  Link,
  PlusCircle,
  Volume2,
  VolumeX,
  RotateCw,
  Barcode as BarcodeIcon,
  Zap,
  Calendar as CalendarIcon,
  Package,
  Clock,
} from 'lucide-react';
import { StockItem } from '../../types';
import { api } from '../../api/client';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'add' | 'open' | 'finish' | 'use';
  stockItems: StockItem[];
  onStockUpdated: () => void;
  onRequestCreateItemWithBarcode: (barcode: string) => void;
}

interface PendingActionItem {
  stockItem: StockItem;
  barcode: string;
  action: 'add' | 'open' | 'finish' | 'use';
  quantity: number;
  expiryDate: string;
  expiresInDays?: string;
  noExpiry?: boolean;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'add',
  stockItems,
  onStockUpdated,
  onRequestCreateItemWithBarcode,
}) => {
  const [mode, setMode] = useState<'add' | 'open' | 'finish' | 'use'>(initialMode);
  const modeRef = useRef<'add' | 'open' | 'finish' | 'use'>(initialMode);
  const [quantityDelta, setQuantityDelta] = useState<number>(1);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Scanner state
  const [scannerActive, setScannerActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);

  // Scanning feedback & result state
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{
    status: 'success' | 'unmapped' | 'error';
    message: string;
    stockItem?: StockItem;
    delta?: number;
    barcode?: string;
  } | null>(null);

  // Pending Action Item Confirmation Workflow state (supports both Add & Use)
  const [pendingActionItem, setPendingActionItem] = useState<PendingActionItem | null>(null);

  // Manual fallback input
  const [manualCode, setManualCode] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Unmapped linking search & selection state
  const [linkSearchQuery, setLinkSearchQuery] = useState<string>('');
  const [selectedStockItemIdForLink, setSelectedStockItemIdForLink] = useState<string>('');
  const [linkBrandLabel, setLinkBrandLabel] = useState<string>('');
  const [isLinking, setIsLinking] = useState<boolean>(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'barcode-scanner-viewport';
  const isCooldownRef = useRef<boolean>(false);

  // Keep modeRef strictly synchronized with mode state
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Sync mode with initialMode prop when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      modeRef.current = initialMode;
      setScanResult(null);
      setLastScannedBarcode(null);
      setManualCode('');
      setCameraError(null);
      setPendingActionItem(null);
      setLinkSearchQuery('');
      setSelectedStockItemIdForLink('');
      setLinkBrandLabel('');
      setTorchOn(false);
    }
  }, [isOpen, initialMode]);

  // Case-insensitive, whitespace-normalized stock items filter for unlinked barcode linking
  const filteredStockItemsForLink = useMemo(() => {
    // Sort A-Z by canonical name first
    const sorted = [...stockItems].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );

    if (!linkSearchQuery.trim()) return sorted;

    const query = linkSearchQuery.toLowerCase().trim().replace(/\s+/g, ' ');
    return sorted.filter((item) => {
      const normName = item.name.toLowerCase().replace(/\s+/g, ' ');
      const normCat = (item.category || '').toLowerCase().replace(/\s+/g, ' ');
      const normLoc = (item.location || '').toLowerCase().replace(/\s+/g, ' ');
      return normName.includes(query) || normCat.includes(query) || normLoc.includes(query);
    });
  }, [stockItems, linkSearchQuery]);

  // Audio chime feedback using Web Audio API
  const playBeep = (type: 'success' | 'warning') => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else {
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch {
      // Audio not permitted or supported
    }
  };

  // Check torch capability from video track
  const checkTorchCapability = () => {
    try {
      const video = document.querySelector(`#${scannerContainerId} video`) as HTMLVideoElement | null;
      const stream = video?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];
      if (track && (track as any).getCapabilities?.()?.torch) {
        setTorchSupported(true);
      } else {
        setTorchSupported(false);
      }
    } catch {
      setTorchSupported(false);
    }
  };

  const toggleTorch = async () => {
    try {
      const video = document.querySelector(`#${scannerContainerId} video`) as HTMLVideoElement | null;
      const stream = video?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];
      if (track) {
        const capabilities = (track as any).getCapabilities?.();
        if (capabilities && 'torch' in capabilities) {
          const nextState = !torchOn;
          await (track as any).applyConstraints({
            advanced: [{ torch: nextState }],
          });
          setTorchOn(nextState);
        } else {
          alert('Flashlight is not available on this camera device.');
        }
      }
    } catch (err) {
      console.warn('Could not toggle torch:', err);
    }
  };

  // Initialize camera list and scanner when modal opens
  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    let isMounted = true;

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!isMounted) return;
        if (devices && devices.length > 0) {
          setCameras(devices);
          const backCamera = devices.find(
            (d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(backCamera ? backCamera.id : devices[0].id);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Could not enumerate cameras:', err);
        setCameraError('Camera access not permitted or camera unavailable. You can type barcodes below.');
      });

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isOpen]);

  // Start scanner when camera is selected
  useEffect(() => {
    if (!isOpen || !selectedCameraId) return;
    startScanner(selectedCameraId);

    return () => {
      stopScanner();
    };
  }, [isOpen, selectedCameraId]);

  const startScanner = async (cameraId: string) => {
    try {
      setCameraError(null);
      await stopScanner();

      const qrScanner = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      });

      scannerRef.current = qrScanner;

      await qrScanner.start(
        cameraId,
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => ({
            width: Math.min(Math.max(viewfinderWidth * 0.7, 180), 240),
            height: Math.min(Math.max(viewfinderHeight * 0.6, 90), 120),
          }),
          aspectRatio: 1.6,
        },
        (decodedText) => {
          handleBarcodeDetected(decodedText);
        },
        () => {
          // ignore scan frame errors
        }
      );

      setScannerActive(true);
      setTimeout(checkTorchCapability, 500);
    } catch (err: any) {
      console.warn('Failed to start barcode scanner:', err);
      setCameraError('Could not start camera video feed. You can still enter barcodes manually.');
      setScannerActive(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      scannerRef.current = null;
    }
    setScannerActive(false);
    setTorchOn(false);
  };

  const handleBarcodeDetected = async (barcode: string) => {
    const cleanBarcode = barcode.trim();
    if (!cleanBarcode) return;

    // Cooldown to prevent duplicate multi-scans in 1.8s
    if (isCooldownRef.current) return;
    isCooldownRef.current = true;

    setTimeout(() => {
      isCooldownRef.current = false;
    }, 1800);

    setLastScannedBarcode(cleanBarcode);
    await processBarcodeScan(cleanBarcode);
  };

  const processBarcodeScan = async (code: string) => {
    setIsProcessing(true);
    const activeMode = modeRef.current; // ALWAYS read from modeRef.current!
    try {
      // First lookup if barcode is mapped to canonical stock item
      let matchedItem: StockItem | null = null;

      // Check local stock items first for instant match
      for (const item of stockItems) {
        if (item.barcodes?.some((b) => b.barcode.trim() === code.trim())) {
          matchedItem = item;
          break;
        }
      }

      // If not found in local state, query server lookup endpoint
      if (!matchedItem) {
        try {
          const lookup = await api.lookupBarcode(code);
          if (lookup.found && lookup.stockItem) {
            matchedItem = lookup.stockItem;
          }
        } catch {
          // fallback to scanBarcode below
        }
      }

      if (!matchedItem) {
        // Test with scanBarcode to see if unmapped
        const response = await api.scanBarcode({
          barcode: code,
          mode: activeMode,
          amount: quantityDelta,
        });

        if (!response.isMapped || !response.stockItem) {
          playBeep('warning');
          setScanResult({
            status: 'unmapped',
            message: `Barcode "${code}" is not yet linked to any household stock item.`,
            barcode: code,
          });
          setPendingActionItem(null);
          return;
        }

        matchedItem = response.stockItem;
      }

      // Prompt user with Action confirmation dialog (Quantity & optional Expiry Date / Days)
      playBeep('success');
      setPendingActionItem({
        stockItem: matchedItem,
        barcode: code,
        action: activeMode,
        quantity: quantityDelta,
        expiryDate: matchedItem.earliest_expiry_date || '',
        expiresInDays: '7',
        noExpiry: false,
      });
      setScanResult(null);
    } catch (err: any) {
      playBeep('warning');
      setScanResult({
        status: 'error',
        message: err.message || 'Failed to process barcode scan',
        barcode: code,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirm Pending Action (Add Stock, Open Item, or Finish/Used Up)
  const handleConfirmAction = async () => {
    if (!pendingActionItem) return;
    setIsProcessing(true);
    const { action, barcode, quantity, expiryDate, expiresInDays, noExpiry, stockItem } = pendingActionItem;

    let targetExpiry: string | undefined = undefined;
    const isOpening = action === 'open' || action === 'use';
    if (isOpening) {
      if (!noExpiry && expiresInDays && Number(expiresInDays) > 0) {
        const d = new Date();
        d.setDate(d.getDate() + Number(expiresInDays));
        targetExpiry = d.toISOString().split('T')[0];
      }
    } else if (action === 'add') {
      targetExpiry = expiryDate.trim() || undefined;
    }

    try {
      const scanApiMode = isOpening ? 'open' : action === 'finish' ? 'finish' : 'add';
      const response = await api.scanBarcode({
        barcode,
        mode: scanApiMode,
        amount: quantity,
        expiry_date: targetExpiry,
      });

      if (response.success && response.stockItem) {
        playBeep('success');
        const updatedItem = response.stockItem;
        let resultMsg = '';
        if (action === 'add') {
          resultMsg = `Added +${quantity} ${updatedItem.unit} to "${updatedItem.name}" (Unopened: ${updatedItem.quantity} ${updatedItem.unit})`;
        } else if (isOpening) {
          resultMsg = targetExpiry
            ? `Opened ${quantity} ${updatedItem.unit} of "${updatedItem.name}" (Unopened: ${updatedItem.quantity}, Opened: ${updatedItem.opened_quantity || 0}) • Expires in ${expiresInDays} days`
            : `Consumed ${quantity} ${updatedItem.unit} from "${updatedItem.name}" (Unopened: ${updatedItem.quantity})`;
        } else {
          resultMsg = `Finished ${quantity} ${updatedItem.unit} of "${updatedItem.name}" (Unopened: ${updatedItem.quantity}, Opened: ${updatedItem.opened_quantity || 0})`;
        }

        setScanResult({
          status: 'success',
          message: resultMsg,
          stockItem: updatedItem,
          delta: action === 'add' ? quantity : -quantity,
          barcode,
        });
        setPendingActionItem(null);
        onStockUpdated();
      }
    } catch (err: any) {
      playBeep('warning');
      setScanResult({
        status: 'error',
        message: err.message || `Failed to ${action} stock`,
        barcode,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setLastScannedBarcode(manualCode.trim());
    processBarcodeScan(manualCode.trim());
  };

  const handleLinkBarcodeToStockItem = async () => {
    if (!selectedStockItemIdForLink || !lastScannedBarcode) return;
    setIsLinking(true);
    const activeMode = modeRef.current;
    try {
      await api.addBarcodeMapping(
        selectedStockItemIdForLink,
        lastScannedBarcode,
        linkBrandLabel || undefined,
        quantityDelta
      );

      const targetStockItem = stockItems.find((s) => s.id === selectedStockItemIdForLink);

      if (targetStockItem) {
        playBeep('success');
        setPendingActionItem({
          stockItem: targetStockItem,
          barcode: lastScannedBarcode,
          action: activeMode,
          quantity: quantityDelta,
          expiryDate: targetStockItem.earliest_expiry_date || '',
        });
        setScanResult(null);
        setSelectedStockItemIdForLink('');
        setLinkSearchQuery('');
        setLinkBrandLabel('');
        onStockUpdated();
        return;
      }
    } catch (err: any) {
      alert(`Error linking barcode: ${err.message}`);
    } finally {
      setIsLinking(false);
    }
  };

  const handleSwitchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].id);
  };

  if (!isOpen) return null;

  return (
    <div
      id="barcode-scanner-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        #${scannerContainerId} video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          max-height: 200px !important;
          border-radius: 1rem !important;
        }
        #${scannerContainerId} {
          border: none !important;
        }
        #${scannerContainerId}__scan_region {
          min-height: unset !important;
        }
      `}</style>

      <div
        id="barcode-scanner-compact-card"
        className="relative bg-white border border-gray-200 rounded-3xl w-full max-w-md p-4 sm:p-5 shadow-2xl animate-in zoom-in-95 max-h-[92vh] overflow-y-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-2xs ${
                mode === 'add' ? 'bg-emerald-600' : 'bg-amber-600'
              }`}
            >
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 tracking-tight font-serif">
                {mode === 'add' ? 'Add Stock (Scan)' : 'Use Stock (Scan)'}
              </h3>
              <p className="text-[11px] text-gray-500 font-medium">
                Compact barcode scanner & inventory tracker
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {torchSupported && scannerActive && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  torchOn ? 'bg-amber-100 text-amber-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title={torchOn ? 'Turn off torch' : 'Turn on torch'}
              >
                <Zap className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              title={soundEnabled ? 'Mute scan sound' : 'Enable scan sound'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
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

        {/* Mode Switcher & Quantity Delta Controls */}
        <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-2 mb-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <div className="flex items-center bg-gray-200/70 p-0.5 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setMode('add');
                modeRef.current = 'add';
                setPendingActionItem(null);
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                mode === 'add'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" /> Add Stock
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('open');
                modeRef.current = 'open';
                setPendingActionItem(null);
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                mode === 'open' || mode === 'use'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> Open Item
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('finish');
                modeRef.current = 'finish';
                setPendingActionItem(null);
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                mode === 'finish'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Minus className="w-3.5 h-3.5 stroke-[3]" /> Finish / Used Up
            </button>
          </div>

          {/* Amount per scan */}
          <div className="flex items-center justify-end gap-1.5 text-xs font-semibold text-gray-700">
            <span className="text-[11px] text-gray-500">Qty:</span>
            <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setQuantityDelta((q) => Math.max(1, q - 1))}
                className="px-2 py-0.5 hover:bg-gray-100 text-gray-600 cursor-pointer font-bold text-xs"
              >
                -
              </button>
              <span className="px-2 py-0.5 text-gray-900 font-bold min-w-[20px] text-center text-xs">
                {quantityDelta}
              </span>
              <button
                type="button"
                onClick={() => setQuantityDelta((q) => q + 1)}
                className="px-2 py-0.5 hover:bg-gray-100 text-gray-600 cursor-pointer font-bold text-xs"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Compact Camera Viewport Container */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-gray-300 shadow-inner mb-3.5 h-44 sm:h-48 flex items-center justify-center">
          <div id={scannerContainerId} className="w-full h-full overflow-hidden flex items-center justify-center" />

          {/* Compact Camera Target Scan Frame Overlay */}
          {scannerActive && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-2">
              <div className="w-48 sm:w-56 h-24 sm:h-28 border-2 border-emerald-400/90 rounded-xl relative shadow-[0_0_12px_rgba(52,211,153,0.3)] animate-pulse flex items-center justify-center">
                <div className="w-full h-0.5 bg-red-500/85 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                <div className="absolute top-1.5 left-2 text-[9px] font-bold text-emerald-300 tracking-wider bg-black/70 px-1.5 py-0.5 rounded">
                  SCAN ZONE
                </div>
              </div>
            </div>
          )}

          {/* Camera switch / controls */}
          {cameras.length > 1 && scannerActive && (
            <button
              type="button"
              onClick={handleSwitchCamera}
              className="absolute top-2.5 right-2.5 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-xl backdrop-blur-xs text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer z-10"
              title="Flip camera"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="text-[11px]">Flip</span>
            </button>
          )}

          {cameraError && (
            <div className="p-3 text-center text-xs text-slate-300 space-y-1.5">
              <Camera className="w-6 h-6 text-slate-500 mx-auto opacity-50" />
              <p className="font-medium text-amber-300 text-[11px]">{cameraError}</p>
            </div>
          )}
        </div>

        {/* STOCK ACTION CONFIRMATION DIALOG */}
        {pendingActionItem && (
          <div
            id="stock-action-confirmation-card"
            className={`p-4 rounded-2xl border mb-3.5 space-y-3.5 animate-in fade-in zoom-in-95 shadow-xs ${
              pendingActionItem.action === 'add'
                ? 'bg-emerald-50/90 border-emerald-300/80'
                : pendingActionItem.action === 'open' || pendingActionItem.action === 'use'
                ? 'bg-amber-50/90 border-amber-300/80'
                : 'bg-rose-50/90 border-rose-300/80'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-200/80">
              <div className="flex items-center gap-2">
                <Package className={`w-4 h-4 ${
                  pendingActionItem.action === 'add' ? 'text-emerald-700' : pendingActionItem.action === 'open' || pendingActionItem.action === 'use' ? 'text-amber-700' : 'text-rose-700'
                }`} />
                <span className={`text-xs font-bold font-serif ${
                  pendingActionItem.action === 'add' ? 'text-emerald-950' : pendingActionItem.action === 'open' || pendingActionItem.action === 'use' ? 'text-amber-950' : 'text-rose-950'
                }`}>
                  {pendingActionItem.action === 'add' ? 'Confirm Add Stock' : pendingActionItem.action === 'open' || pendingActionItem.action === 'use' ? 'Confirm Open Item' : 'Confirm Finish / Used Up'}
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white text-gray-800 border border-gray-200">
                {pendingActionItem.barcode}
              </span>
            </div>

            <div>
              <h4 className="text-sm font-bold text-gray-900">
                {pendingActionItem.stockItem.name}
              </h4>
              <p className="text-xs text-gray-600 mt-0.5">
                Current inventory: <span className="font-bold text-gray-900">{pendingActionItem.stockItem.quantity} unopened</span>
                {pendingActionItem.stockItem.opened_quantity ? (
                  <span className="text-amber-700 font-semibold ml-1.5">• {pendingActionItem.stockItem.opened_quantity} opened</span>
                ) : null}
              </p>
            </div>

            {/* Quantity control */}
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-2.5">
              <span className="text-xs font-bold text-gray-700">
                Quantity to {pendingActionItem.action === 'add' ? 'Add' : pendingActionItem.action === 'open' || pendingActionItem.action === 'use' ? 'Open' : 'Finish'}:
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setPendingActionItem({
                      ...pendingActionItem,
                      quantity: Math.max(1, pendingActionItem.quantity - 1),
                    })
                  }
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold flex items-center justify-center cursor-pointer text-xs"
                >
                  -
                </button>
                <span className="w-8 text-center font-bold text-gray-900 text-xs">
                  {pendingActionItem.quantity}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPendingActionItem({
                      ...pendingActionItem,
                      quantity: pendingActionItem.quantity + 1,
                    })
                  }
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold flex items-center justify-center cursor-pointer text-xs"
                >
                  +
                </button>
                <span className="text-xs font-semibold text-gray-500 ml-1">
                  {pendingActionItem.stockItem.unit}
                </span>
              </div>
            </div>

            {/* Validation Message if attempting to open more than available unopened stock */}
            {(pendingActionItem.action === 'open' || pendingActionItem.action === 'use') && pendingActionItem.quantity > pendingActionItem.stockItem.quantity && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-1.5">
                <span>Cannot open {pendingActionItem.quantity} {pendingActionItem.stockItem.unit}. Only {pendingActionItem.stockItem.quantity} unopened available in stock.</span>
              </div>
            )}

            {/* Expiry Input / Notes depending on action */}
            {pendingActionItem.action === 'add' ? (
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-700 flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-gray-600" />
                  <span>Expiry Date (Optional)</span>
                </label>
                <input
                  type="date"
                  id="stock-action-expiry-date-input"
                  value={pendingActionItem.expiryDate}
                  onChange={(e) =>
                    setPendingActionItem({
                      ...pendingActionItem,
                      expiryDate: e.target.value,
                    })
                  }
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-900 font-medium focus:outline-none focus:border-gray-600 shadow-2xs"
                />
              </div>
            ) : pendingActionItem.action === 'open' || pendingActionItem.action === 'use' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-2.5">
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-amber-700" />
                    <span>Expires in:</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      disabled={pendingActionItem.noExpiry}
                      value={pendingActionItem.expiresInDays ?? '7'}
                      onChange={(e) =>
                        setPendingActionItem({
                          ...pendingActionItem,
                          expiresInDays: e.target.value,
                        })
                      }
                      className="w-16 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs text-center font-bold text-gray-900 focus:outline-none focus:border-amber-500 disabled:bg-gray-100 disabled:text-gray-400"
                    />
                    <span className="text-xs font-semibold text-gray-600">days</span>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600 pl-1">
                  <input
                    type="checkbox"
                    checked={pendingActionItem.noExpiry || false}
                    onChange={(e) =>
                      setPendingActionItem({
                        ...pendingActionItem,
                        noExpiry: e.target.checked,
                      })
                    }
                    className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span>No expiry (immediately consumed)</span>
                </label>
              </div>
            ) : (
              <p className="text-xs text-rose-800 font-medium bg-white border border-rose-200 rounded-xl p-2.5">
                Item will be removed from active stock and checked for replenishment against target level ({pendingActionItem.stockItem.target_stock || pendingActionItem.stockItem.restock_target || 2} {pendingActionItem.stockItem.unit}).
              </p>
            )}

            {/* Confirmation actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingActionItem(null)}
                className="px-3.5 py-1.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={
                  isProcessing ||
                  ((pendingActionItem.action === 'open' || pendingActionItem.action === 'use') && pendingActionItem.quantity > pendingActionItem.stockItem.quantity)
                }
                className={`px-4 py-1.5 rounded-xl text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ${
                  pendingActionItem.action === 'add'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : pendingActionItem.action === 'open' || pendingActionItem.action === 'use'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {pendingActionItem.action === 'add' ? (
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                ) : (
                  <Minus className="w-3.5 h-3.5 stroke-[3]" />
                )}
                <span>
                  {isProcessing
                    ? 'Updating...'
                    : `Confirm ${pendingActionItem.action === 'add' ? 'Add' : pendingActionItem.action === 'open' || pendingActionItem.action === 'use' ? 'Open' : 'Finish'} ${pendingActionItem.quantity} ${pendingActionItem.stockItem.unit}`}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Real-time Scan Result Card */}
        {scanResult && !pendingActionItem && (
          <div
            className={`p-3 rounded-2xl border mb-3.5 animate-in fade-in zoom-in-95 ${
              scanResult.status === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : scanResult.status === 'unmapped'
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-red-50 border-red-200 text-red-950'
            }`}
          >
            <div className="flex items-start gap-2">
              {scanResult.status === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-0.5">
                <div className="text-xs font-bold leading-tight">{scanResult.message}</div>
                {scanResult.barcode && (
                  <div className="text-[10px] font-mono text-gray-500">
                    Barcode: {scanResult.barcode}
                  </div>
                )}
              </div>
            </div>

            {/* UNMAPPED BARCODE RESOLVER */}
            {scanResult.status === 'unmapped' && scanResult.barcode && (
              <div className="mt-2.5 pt-2.5 border-t border-amber-200/70 space-y-2.5">
                <p className="text-xs font-semibold text-amber-900">
                  Assign this barcode to your inventory:
                </p>

                <div className="bg-white/90 border border-amber-200 rounded-xl p-2.5 space-y-2">
                  <label className="block text-[11px] font-bold text-gray-700 flex items-center gap-1">
                    <Link className="w-3.5 h-3.5 text-blue-600" /> Search & Link to Existing Household Stock Item
                  </label>

                  {/* Search Filter for Stock Items */}
                  <input
                    type="text"
                    placeholder="Search existing items (e.g. Milk, Eggs)..."
                    value={linkSearchQuery}
                    onChange={(e) => setLinkSearchQuery(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-900 focus:outline-none focus:border-blue-500 placeholder-gray-400"
                  />

                  <select
                    value={selectedStockItemIdForLink}
                    onChange={(e) => setSelectedStockItemIdForLink(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 font-medium focus:outline-none focus:border-blue-500"
                  >
                    <option value="">
                      {filteredStockItemsForLink.length > 0
                        ? `Select stock item (${filteredStockItemsForLink.length} matched)...`
                        : 'No matching stock items found'}
                    </option>
                    {filteredStockItemsForLink.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.quantity} {item.unit} in {item.category})
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="Brand or product label (optional, e.g. Devondale 2L)"
                    value={linkBrandLabel}
                    onChange={(e) => setLinkBrandLabel(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500 placeholder-gray-400"
                  />

                  <button
                    type="button"
                    onClick={handleLinkBarcodeToStockItem}
                    disabled={!selectedStockItemIdForLink || isLinking}
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <Link className="w-3.5 h-3.5" />
                    <span>{isLinking ? 'Linking...' : `Link Barcode & ${mode === 'add' ? 'Add Stock' : 'Use Stock'}`}</span>
                  </button>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">OR</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (scanResult.barcode) {
                      onRequestCreateItemWithBarcode(scanResult.barcode);
                    }
                  }}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Create New Stock Item with this Barcode</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Manual Barcode Entry Fallback Form */}
        <form onSubmit={handleManualSubmit} className="space-y-1.5 pt-2 border-t border-gray-100">
          <label className="block text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <BarcodeIcon className="w-3.5 h-3.5 text-gray-500" />
            <span>Manual Barcode Number</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              id="manual-barcode-input"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="e.g. 9300601234567"
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-900 font-mono placeholder-gray-400 focus:outline-none focus:border-gray-900"
            />
            <button
              type="submit"
              disabled={!manualCode.trim() || isProcessing}
              className="px-3.5 py-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 shadow-2xs"
            >
              {isProcessing ? 'Processing...' : 'Submit'}
            </button>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors cursor-pointer"
          >
            Done Scanning
          </button>
        </div>
      </div>
    </div>
  );
};
