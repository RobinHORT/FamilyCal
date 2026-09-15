import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { StockItem } from '../../types';
import { api } from '../../api/client';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'add' | 'use';
  stockItems: StockItem[];
  onStockUpdated: () => void;
  onRequestCreateItemWithBarcode: (barcode: string) => void;
}

interface PendingUseItem {
  stockItem: StockItem;
  barcode: string;
  quantity: number;
  expiryDate: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'add',
  stockItems,
  onStockUpdated,
  onRequestCreateItemWithBarcode,
}) => {
  const [mode, setMode] = useState<'add' | 'use'>(initialMode);
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

  // Pending Use Stock Confirmation Workflow state
  const [pendingUseItem, setPendingUseItem] = useState<PendingUseItem | null>(null);

  // Manual fallback input
  const [manualCode, setManualCode] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Unmapped linking dropdown
  const [selectedStockItemIdForLink, setSelectedStockItemIdForLink] = useState<string>('');
  const [linkBrandLabel, setLinkBrandLabel] = useState<string>('');
  const [isLinking, setIsLinking] = useState<boolean>(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'barcode-scanner-viewport';
  const isCooldownRef = useRef<boolean>(false);

  // Sync mode with initialMode prop when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setScanResult(null);
      setLastScannedBarcode(null);
      setManualCode('');
      setCameraError(null);
      setPendingUseItem(null);
      setTorchOn(false);
    }
  }, [isOpen, initialMode]);

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
          mode,
          amount: quantityDelta,
        });

        if (!response.isMapped || !response.stockItem) {
          playBeep('warning');
          setScanResult({
            status: 'unmapped',
            message: `Barcode "${code}" is not yet linked to any household stock item.`,
            barcode: code,
          });
          setPendingUseItem(null);
          return;
        }

        matchedItem = response.stockItem;
      }

      // If we are in USE STOCK mode:
      // Prompt user for Quantity and optional Expiry Date before completing the stock-use action!
      if (mode === 'use') {
        playBeep('success');
        setPendingUseItem({
          stockItem: matchedItem,
          barcode: code,
          quantity: quantityDelta,
          expiryDate: matchedItem.earliest_expiry_date || '',
        });
        setScanResult(null);
        return;
      }

      // If we are in ADD STOCK mode:
      // Directly execute stock addition
      const response = await api.scanBarcode({
        barcode: code,
        mode: 'add',
        amount: quantityDelta,
      });

      if (response.success && response.stockItem) {
        playBeep('success');
        setScanResult({
          status: 'success',
          message: `Added +${quantityDelta} to "${response.stockItem.name}" (Now: ${response.stockItem.quantity} ${response.stockItem.unit})`,
          stockItem: response.stockItem,
          delta: response.delta,
          barcode: code,
        });
        onStockUpdated();
      }
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

  // Confirm Use Stock action with quantity and optional expiry date
  const handleConfirmUseStock = async () => {
    if (!pendingUseItem) return;
    setIsProcessing(true);
    try {
      const response = await api.scanBarcode({
        barcode: pendingUseItem.barcode,
        mode: 'use',
        amount: pendingUseItem.quantity,
        expiry_date: pendingUseItem.expiryDate.trim() || undefined,
      });

      if (response.success && response.stockItem) {
        playBeep('success');
        setScanResult({
          status: 'success',
          message: `Used ${pendingUseItem.quantity} ${response.stockItem.unit} from "${response.stockItem.name}" (Now: ${response.stockItem.quantity} ${response.stockItem.unit})${
            pendingUseItem.expiryDate ? ` • Expiry: ${pendingUseItem.expiryDate}` : ''
          }`,
          stockItem: response.stockItem,
          delta: response.delta,
          barcode: pendingUseItem.barcode,
        });
        setPendingUseItem(null);
        onStockUpdated();
      }
    } catch (err: any) {
      playBeep('warning');
      setScanResult({
        status: 'error',
        message: err.message || 'Failed to use stock',
        barcode: pendingUseItem.barcode,
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
    try {
      await api.addBarcodeMapping(
        selectedStockItemIdForLink,
        lastScannedBarcode,
        linkBrandLabel || undefined,
        quantityDelta
      );

      const targetStockItem = stockItems.find((s) => s.id === selectedStockItemIdForLink);

      if (mode === 'use' && targetStockItem) {
        playBeep('success');
        setPendingUseItem({
          stockItem: targetStockItem,
          barcode: lastScannedBarcode,
          quantity: quantityDelta,
          expiryDate: targetStockItem.earliest_expiry_date || '',
        });
        setScanResult(null);
        setSelectedStockItemIdForLink('');
        setLinkBrandLabel('');
        onStockUpdated();
        return;
      }

      // If in Add mode, apply addition immediately
      const adjustRes = await api.adjustStockQuantity(selectedStockItemIdForLink, {
        action: 'add',
        amount: quantityDelta,
        barcode: lastScannedBarcode,
      });

      playBeep('success');
      setScanResult({
        status: 'success',
        message: `Linked barcode "${lastScannedBarcode}" to "${adjustRes.name}" and added ${quantityDelta} ${adjustRes.unit}!`,
        stockItem: adjustRes,
        barcode: lastScannedBarcode,
      });
      setSelectedStockItemIdForLink('');
      setLinkBrandLabel('');
      onStockUpdated();
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
        <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-2 mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center bg-gray-200/70 p-0.5 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMode('add');
                setPendingUseItem(null);
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
                setMode('use');
                setPendingUseItem(null);
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === 'use'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Minus className="w-3.5 h-3.5 stroke-[3]" /> Use Stock
            </button>
          </div>

          {/* Amount per scan */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
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

        {/* USE STOCK CONFIRMATION DIALOG: Ask for Expiry Date & Quantity */}
        {pendingUseItem && (
          <div
            id="use-stock-confirmation-card"
            className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300/80 mb-3.5 space-y-3.5 animate-in fade-in zoom-in-95 shadow-xs"
          >
            <div className="flex items-center justify-between pb-2 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-700" />
                <span className="text-xs font-bold text-amber-950 font-serif">
                  Confirm Stock Usage
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                {pendingUseItem.barcode}
              </span>
            </div>

            <div>
              <h4 className="text-sm font-bold text-gray-900">
                {pendingUseItem.stockItem.name}
              </h4>
              <p className="text-xs text-gray-600 mt-0.5">
                Current inventory: <span className="font-bold text-gray-900">{pendingUseItem.stockItem.quantity} {pendingUseItem.stockItem.unit}</span> ({pendingUseItem.stockItem.category})
              </p>
            </div>

            {/* Quantity to Use */}
            <div className="flex items-center justify-between bg-white border border-amber-200 rounded-xl p-2.5">
              <span className="text-xs font-bold text-gray-700">Quantity to Use:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setPendingUseItem({
                      ...pendingUseItem,
                      quantity: Math.max(1, pendingUseItem.quantity - 1),
                    })
                  }
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold flex items-center justify-center cursor-pointer text-xs"
                >
                  -
                </button>
                <span className="w-8 text-center font-bold text-gray-900 text-xs">
                  {pendingUseItem.quantity}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPendingUseItem({
                      ...pendingUseItem,
                      quantity: pendingUseItem.quantity + 1,
                    })
                  }
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold flex items-center justify-center cursor-pointer text-xs"
                >
                  +
                </button>
                <span className="text-xs font-semibold text-gray-500 ml-1">
                  {pendingUseItem.stockItem.unit}
                </span>
              </div>
            </div>

            {/* Expiry Date input (Optional) */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-gray-700 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-amber-700" />
                <span>Expiry Date (Optional)</span>
              </label>
              <input
                type="date"
                id="use-stock-expiry-date-input"
                value={pendingUseItem.expiryDate}
                onChange={(e) =>
                  setPendingUseItem({
                    ...pendingUseItem,
                    expiryDate: e.target.value,
                  })
                }
                className="w-full bg-white border border-amber-200 rounded-xl px-3 py-1.5 text-xs text-gray-900 font-medium focus:outline-none focus:border-amber-600 shadow-2xs"
              />
              <p className="text-[10px] text-gray-500">
                {pendingUseItem.stockItem.earliest_expiry_date ? (
                  <span>
                    Existing recorded expiry: <strong>{pendingUseItem.stockItem.earliest_expiry_date}</strong> (preserved unless changed).
                  </span>
                ) : (
                  'Leave blank if expiry does not apply to this opened item.'
                )}
              </p>
            </div>

            {/* Confirmation actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingUseItem(null)}
                className="px-3.5 py-1.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUseStock}
                disabled={isProcessing}
                className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Minus className="w-3.5 h-3.5 stroke-[3]" />
                <span>{isProcessing ? 'Updating...' : `Confirm Use ${pendingUseItem.quantity} ${pendingUseItem.stockItem.unit}`}</span>
              </button>
            </div>
          </div>
        )}

        {/* Real-time Scan Result Card */}
        {scanResult && !pendingUseItem && (
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
                    <Link className="w-3.5 h-3.5 text-blue-600" /> Link to Existing Household Stock Item
                  </label>
                  <select
                    value={selectedStockItemIdForLink}
                    onChange={(e) => setSelectedStockItemIdForLink(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 font-medium focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select stock item (A-Z sorted)...</option>
                    {stockItems.map((item) => (
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
                    <span>{isLinking ? 'Linking...' : `Link Barcode & ${mode === 'add' ? 'Add' : 'Use'}`}</span>
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
