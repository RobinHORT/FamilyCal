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
  Search,
  Volume2,
  VolumeX,
  RotateCw,
  Barcode as BarcodeIcon,
  Sparkles,
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
  const [continuousMode, setContinuousMode] = useState<boolean>(true);

  // Scanner state
  const [scannerActive, setScannerActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  // Scanning feedback state
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{
    status: 'success' | 'unmapped' | 'error';
    message: string;
    stockItem?: StockItem;
    delta?: number;
    barcode?: string;
  } | null>(null);

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
          // Prefer back/environment facing camera
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
          qrbox: { width: 260, height: 160 },
          aspectRatio: 1.3333,
        },
        (decodedText) => {
          handleBarcodeDetected(decodedText);
        },
        () => {
          // ignore scan frame errors
        }
      );

      setScannerActive(true);
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
  };

  const handleBarcodeDetected = async (barcode: string) => {
    const cleanBarcode = barcode.trim();
    if (!cleanBarcode) return;

    // Cooldown to prevent duplicate multi-scans of the same item in 1.8s
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
      const response = await api.scanBarcode({
        barcode: code,
        mode,
        amount: quantityDelta,
      });

      if (response.success && response.isMapped && response.stockItem) {
        playBeep('success');
        setScanResult({
          status: 'success',
          message:
            mode === 'add'
              ? `Added +${quantityDelta} to "${response.stockItem.name}" (Now: ${response.stockItem.quantity} ${response.stockItem.unit})`
              : `Used ${quantityDelta} from "${response.stockItem.name}" (Now: ${response.stockItem.quantity} ${response.stockItem.unit})`,
          stockItem: response.stockItem,
          delta: response.delta,
          barcode: code,
        });
        onStockUpdated();
      } else {
        playBeep('warning');
        setScanResult({
          status: 'unmapped',
          message: `Barcode "${code}" is not yet linked to any household stock item.`,
          barcode: code,
        });
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

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
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

      // Now immediately apply the scan action!
      const adjustRes = await api.adjustStockQuantity(selectedStockItemIdForLink, {
        action: mode === 'add' ? 'add' : 'use',
        amount: quantityDelta,
        barcode: lastScannedBarcode,
      });

      playBeep('success');
      setScanResult({
        status: 'success',
        message: `Linked barcode "${lastScannedBarcode}" to "${adjustRes.name}" and ${
          mode === 'add' ? 'added' : 'used'
        } ${quantityDelta} ${adjustRes.unit}!`,
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="barcode-scanner-dialog"
        className="relative bg-white border border-gray-200 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[94vh] overflow-y-auto"
      >
        {/* Mobile Drag Indicator Bar */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-2xs ${
                mode === 'add' ? 'bg-emerald-600' : 'bg-amber-600'
              }`}
            >
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight font-serif">
                {mode === 'add' ? 'Add Stock (Scan)' : 'Use Stock (Scan)'}
              </h3>
              <p className="text-[11px] text-gray-500 font-medium">
                Point camera at any barcode or enter manually
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
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
        <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-2.5 mb-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center bg-gray-200/70 p-1 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setMode('add')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === 'add'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" /> Add Stock
            </button>
            <button
              type="button"
              onClick={() => setMode('use')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === 'use'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Minus className="w-3.5 h-3.5 stroke-[3]" /> Use Stock
            </button>
          </div>

          {/* Amount per scan */}
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
            <span>Qty per scan:</span>
            <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setQuantityDelta((q) => Math.max(1, q - 1))}
                className="px-2 py-1 hover:bg-gray-100 text-gray-600 cursor-pointer font-bold"
              >
                -
              </button>
              <span className="px-2.5 py-1 text-gray-900 font-bold min-w-[24px] text-center">
                {quantityDelta}
              </span>
              <button
                type="button"
                onClick={() => setQuantityDelta((q) => q + 1)}
                className="px-2 py-1 hover:bg-gray-100 text-gray-600 cursor-pointer font-bold"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Camera Viewport Container */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-gray-300 shadow-inner mb-4 min-h-[220px] flex items-center justify-center">
          <div id={scannerContainerId} className="w-full overflow-hidden" />

          {/* Camera overlay guide */}
          {scannerActive && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              <div className="w-64 h-36 border-2 border-emerald-400/90 rounded-2xl relative shadow-[0_0_15px_rgba(52,211,153,0.3)] animate-pulse flex items-center justify-center">
                <div className="w-full h-0.5 bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-bounce" />
                <div className="absolute top-2 left-2 text-[10px] font-bold text-emerald-300 tracking-wider bg-black/60 px-1.5 py-0.5 rounded">
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
              className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white p-2 rounded-xl backdrop-blur-xs text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer z-10"
              title="Flip camera"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Flip</span>
            </button>
          )}

          {cameraError && (
            <div className="p-4 text-center text-xs text-slate-300 space-y-2">
              <Camera className="w-8 h-8 text-slate-500 mx-auto opacity-50" />
              <p className="font-medium text-amber-300">{cameraError}</p>
            </div>
          )}
        </div>

        {/* Real-time Scan Result Card */}
        {scanResult && (
          <div
            className={`p-3.5 rounded-2xl border mb-4 animate-in fade-in zoom-in-95 ${
              scanResult.status === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : scanResult.status === 'unmapped'
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-red-50 border-red-200 text-red-950'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {scanResult.status === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <div className="text-xs font-bold leading-tight">{scanResult.message}</div>
                {scanResult.barcode && (
                  <div className="text-[11px] font-mono text-gray-500">
                    Barcode: {scanResult.barcode}
                  </div>
                )}
              </div>
            </div>

            {/* UNMAPPED BARCODE RESOLVER: Link to existing or Create New */}
            {scanResult.status === 'unmapped' && scanResult.barcode && (
              <div className="mt-3 pt-3 border-t border-amber-200/70 space-y-3">
                <p className="text-xs font-semibold text-amber-900">
                  How would you like to assign this barcode?
                </p>

                {/* Option A: Link to Existing Stock Item */}
                <div className="bg-white/80 border border-amber-200 rounded-xl p-3 space-y-2">
                  <label className="block text-[11px] font-bold text-gray-700 flex items-center gap-1">
                    <Link className="w-3.5 h-3.5 text-blue-600" /> Link to Existing Household Stock Item
                  </label>
                  <select
                    value={selectedStockItemIdForLink}
                    onChange={(e) => setSelectedStockItemIdForLink(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-medium focus:outline-none focus:border-blue-500"
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
                    className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500 placeholder-gray-400"
                  />

                  <button
                    type="button"
                    onClick={handleLinkBarcodeToStockItem}
                    disabled={!selectedStockItemIdForLink || isLinking}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <Link className="w-3.5 h-3.5" />
                    <span>{isLinking ? 'Linking...' : `Link Barcode & ${mode === 'add' ? 'Add' : 'Use'}`}</span>
                  </button>
                </div>

                {/* Option B: Create New Item */}
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">OR</span>
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
        <form onSubmit={handleManualSubmit} className="space-y-2 pt-2 border-t border-gray-100">
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
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 font-mono placeholder-gray-400 focus:outline-none focus:border-gray-900"
            />
            <button
              type="submit"
              disabled={!manualCode.trim() || isProcessing}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 shadow-2xs"
            >
              {isProcessing ? 'Processing...' : 'Submit'}
            </button>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors cursor-pointer"
          >
            Done Scanning
          </button>
        </div>
      </div>
    </div>
  );
};
