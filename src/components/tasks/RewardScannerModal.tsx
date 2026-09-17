import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client';

interface RewardScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRewardFulfilled: () => void;
}

export const RewardScannerModal: React.FC<RewardScannerModalProps> = ({
  isOpen,
  onClose,
  onRewardFulfilled,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    reward_name: string;
    redeemed_quantity: number;
    remaining_quantity: number;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'reward-qr-reader-container';

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessResult(null);
      setIsProcessing(false);

      // Give DOM time to render the element
      const timer = setTimeout(() => {
        startScanner();
      }, 300);

      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [isOpen]);

  const startScanner = async () => {
    try {
      const container = document.getElementById(scannerContainerId);
      if (!container) return;

      const html5Qrcode = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = html5Qrcode;

      await html5Qrcode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
        },
        async (decodedText) => {
          handleScanToken(decodedText);
        },
        () => {
          // ignore scan errors
        }
      );
    } catch (err: any) {
      console.error('Failed to start QR scanner:', err);
      // Fallback if environment camera fails
      try {
        if (scannerRef.current) {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras && cameras.length > 0) {
            await scannerRef.current.start(
              cameras[0].id,
              { fps: 10, qrbox: { width: 220, height: 220 } },
              (decodedText) => handleScanToken(decodedText),
              () => {}
            );
          } else {
            setError('No camera found on this device.');
          }
        }
      } catch (fallbackErr: any) {
        setError('Camera permission denied or camera not available.');
      }
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      } finally {
        scannerRef.current = null;
      }
    }
  };

  const handleScanToken = async (scannedToken: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      // Pause scanner while validating with server
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.pause(true);
      }

      const res = await api.fulfillRedemptionToken(scannedToken);

      setSuccessResult({
        reward_name: res.reward_name,
        redeemed_quantity: res.redeemed_quantity,
        remaining_quantity: res.remaining_quantity,
      });

      // Stop camera cleanly
      await stopScanner();

      // Trigger completion and close after brief delay
      setTimeout(() => {
        onRewardFulfilled();
        onClose();
      }, 1400);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired redemption QR code.');

      // Resume scanner after 2.5s delay so user can scan another
      setTimeout(() => {
        setError(null);
        setIsProcessing(false);
        if (scannerRef.current) {
          try {
            scannerRef.current.resume();
          } catch {
            // ignore
          }
        }
      }, 2500);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="reward-scanner-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) {
          stopScanner();
          onClose();
        }
      }}
    >
      <div
        id="reward-scanner-modal-card"
        className="relative bg-white border border-gray-200 rounded-3xl w-full max-w-sm p-5 shadow-2xl animate-in zoom-in-95 space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200/80 flex items-center justify-center text-purple-700">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight">
                Scan Reward
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-gray-500 font-medium text-center">
          Ask the member to display their redemption QR code.
        </p>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* SUCCESS BADGE */}
        {successResult ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-gray-900">
              Reward Fulfilled!
            </h4>
            <div className="text-xs font-semibold text-gray-700">
              {successResult.redeemed_quantity} × {successResult.reward_name}
            </div>
            {successResult.remaining_quantity > 0 && (
              <p className="text-[11px] text-gray-500">
                {successResult.remaining_quantity} remaining owed
              </p>
            )}
          </div>
        ) : (
          /* SCANNER VIEWPORT */
          <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-950 min-h-[260px] flex items-center justify-center">
            <div
              id={scannerContainerId}
              className="w-full h-full overflow-hidden [&_video]:object-cover"
            />

            {/* Framing guide overlay */}
            <div className="absolute inset-0 pointer-events-none border-[24px] border-black/40 flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-white/80 rounded-xl border-dashed" />
            </div>

            {isProcessing && !successResult && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center text-white text-xs font-bold gap-2">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Validating QR code...</span>
              </div>
            )}
          </div>
        )}

        {/* Cancel Button */}
        <div className="pt-1">
          <button
            type="button"
            id="btn-close-scanner"
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="w-full py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
