import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { X, Minus, Plus, AlertCircle, CheckCircle2, QrCode } from 'lucide-react';
import { RewardExchange } from '../../types';
import { api } from '../../api/client';

interface RedemptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  exchange: RewardExchange | null;
  onFulfilled: () => void;
}

export function formatQuantityDetails(quantity: number, description?: string | null, name?: string) {
  const text = (description || name || '').trim();

  // Pattern: "1 hour", "2 hrs", "30 mins"
  const timeMatch = text.match(/^(\d+)\s*(hour|hr|minute|min)s?/i);
  if (timeMatch) {
    const val = parseInt(timeMatch[1], 10);
    const unit = timeMatch[2].toLowerCase();
    const total = val * quantity;
    const unitLabel = total === 1 ? unit : `${unit}s`;
    return {
      availableLabel: `${quantity} × ${val} ${timeMatch[2]}`,
      unitLabel: `${total} ${unitLabel}`,
    };
  }

  // Pattern: "$5", "$10"
  const moneyMatch = text.match(/^\$(\d+(?:\.\d+)?)/);
  if (moneyMatch) {
    const val = parseFloat(moneyMatch[1]);
    return {
      availableLabel: `${quantity} × $${val}`,
      unitLabel: `$${val * quantity}`,
    };
  }

  if (description && description.trim()) {
    return {
      availableLabel: `${quantity} × ${description}`,
      unitLabel: `${quantity} ${quantity === 1 ? 'item' : 'items'}`,
    };
  }

  return {
    availableLabel: `${quantity} owed`,
    unitLabel: `${quantity} ${quantity === 1 ? 'unit' : 'units'}`,
  };
}

export const RedemptionModal: React.FC<RedemptionModalProps> = ({
  isOpen,
  onClose,
  exchange,
  onFulfilled,
}) => {
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [step, setStep] = useState<'quantity' | 'qr' | 'success'>('quantity');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // QR state
  const [token, setToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Reset when modal opens with a new exchange
  useEffect(() => {
    if (isOpen && exchange) {
      setSelectedQuantity(1);
      setStep('quantity');
      setIsLoading(false);
      setError(null);
      setToken(null);
      setQrDataUrl('');
    } else if (!isOpen) {
      stopPolling();
    }
  }, [isOpen, exchange]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  if (!isOpen || !exchange) return null;

  const maxQty = exchange.quantity;
  const availableDetails = formatQuantityDetails(
    maxQty,
    exchange.reward_description,
    exchange.reward_name
  );
  const selectedDetails = formatQuantityDetails(
    selectedQuantity,
    exchange.reward_description,
    exchange.reward_name
  );

  const handleGenerateQr = async () => {
    if (selectedQuantity < 1 || selectedQuantity > maxQty) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await api.createRedemptionToken(exchange.id, selectedQuantity);
      setToken(res.token);

      // Generate QR Code data URL
      const url = await QRCode.toDataURL(res.token, {
        width: 260,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
      setQrDataUrl(url);
      setStep('qr');

      // Start polling status every 1.5 seconds
      stopPolling();
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await api.checkRedemptionTokenStatus(res.token);
          if (statusRes.status === 'used') {
            stopPolling();
            setStep('success');
            setTimeout(() => {
              onFulfilled();
              onClose();
            }, 1200);
          } else if (statusRes.status === 'cancelled' || statusRes.status === 'expired') {
            stopPolling();
            setError(`Redemption token ${statusRes.status}. Please try again.`);
            setStep('quantity');
          }
        } catch {
          // ignore poll network errors
        }
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to generate redemption QR code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelQr = async () => {
    stopPolling();
    if (token) {
      try {
        await api.cancelRedemptionToken(token);
      } catch {
        // ignore
      }
    }
    setToken(null);
    setQrDataUrl('');
    setStep('quantity');
    onClose();
  };

  return (
    <div
      id="redemption-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (step === 'qr') {
            handleCancelQr();
          } else {
            onClose();
          }
        }
      }}
    >
      <div
        id="redemption-modal-card"
        className="relative bg-white border border-gray-200 rounded-3xl w-full max-w-sm p-5 shadow-2xl animate-in zoom-in-95 space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-700">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight">
                Redeem {exchange.reward_name}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={step === 'qr' ? handleCancelQr : onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: QUANTITY SELECTION */}
        {step === 'quantity' && (
          <div className="space-y-4 pt-1">
            {/* Available quantity display */}
            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-center space-y-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                You have:
              </span>
              <div className="text-base font-bold text-gray-900">
                {availableDetails.availableLabel}
              </div>
            </div>

            {/* Question & Stepper */}
            <div className="text-center space-y-3">
              <label className="block text-xs font-bold text-gray-700">
                How many do you want to redeem?
              </label>

              {/* Stepper control */}
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  id="btn-redeem-qty-minus"
                  disabled={selectedQuantity <= 1}
                  onClick={() => setSelectedQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold flex items-center justify-center disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Minus className="w-4 h-4 stroke-[3]" />
                </button>

                <div className="w-16 text-center text-xl font-bold text-gray-900">
                  {selectedQuantity}
                </div>

                <button
                  type="button"
                  id="btn-redeem-qty-plus"
                  disabled={selectedQuantity >= maxQty}
                  onClick={() => setSelectedQuantity((q) => Math.min(maxQty, q + 1))}
                  className="w-10 h-10 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold flex items-center justify-center disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                </button>
              </div>

              {/* Unit total */}
              <div className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 rounded-xl py-1.5 px-3 inline-block">
                {selectedDetails.unitLabel}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-generate-qr"
                disabled={isLoading}
                onClick={handleGenerateQr}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isLoading ? 'Generating...' : 'Generate QR'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: DISPLAY QR CODE */}
        {step === 'qr' && (
          <div className="space-y-4 text-center pt-1">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-gray-800">
                {selectedDetails.availableLabel}
              </div>
              <div className="text-sm font-bold text-blue-700">
                {selectedDetails.unitLabel}
              </div>
            </div>

            <p className="text-xs text-gray-500 font-medium">
              Show this QR code to an adult.
            </p>

            {/* QR Code Container */}
            <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-inner inline-block mx-auto">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Redemption QR Code"
                  className="w-56 h-56 object-contain mx-auto"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-xs text-gray-400">
                  Loading QR Code...
                </div>
              )}
            </div>

            {/* Waiting indicator */}
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-gray-600">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
              <span>Waiting for scan...</span>
            </div>

            {/* Cancel Button */}
            <div className="pt-1">
              <button
                type="button"
                id="btn-cancel-qr"
                onClick={handleCancelQr}
                className="w-full py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS FEEDBACK */}
        {step === 'success' && (
          <div className="py-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h4 className="text-base font-bold text-gray-900">Fulfilled!</h4>
            <p className="text-xs text-gray-600 font-medium">
              Redeemed {selectedDetails.unitLabel} of {exchange.reward_name}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
