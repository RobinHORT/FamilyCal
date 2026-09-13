import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar as CalendarIcon, CheckSquare, X } from 'lucide-react';
import { useCalendar } from '../../context/CalendarContext';

export const CalendarAddChoiceModal: React.FC = () => {
  const {
    isAddChoiceModalOpen,
    closeAddChoiceModal,
    addChoiceInitialDate,
    openCreateEventModal,
    openCreateTaskModal,
  } = useCalendar();

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAddChoiceModalOpen) {
        closeAddChoiceModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddChoiceModalOpen, closeAddChoiceModal]);

  if (!isAddChoiceModalOpen) return null;

  const targetDate = addChoiceInitialDate || new Date();

  const handleSelectEvent = () => {
    closeAddChoiceModal();
    openCreateEventModal(targetDate);
  };

  const handleSelectTask = () => {
    closeAddChoiceModal();
    openCreateTaskModal(targetDate);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          ref={modalRef}
          className="w-full max-w-xs bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">Create New</h3>
            <button
              type="button"
              onClick={closeAddChoiceModal}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Choices: ONLY Event and Task */}
          <div className="p-4 pt-1 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleSelectEvent}
              className="flex items-center gap-3.5 w-full p-3.5 rounded-xl bg-blue-50/70 hover:bg-blue-100/70 text-blue-900 font-semibold text-sm transition-all text-left border border-blue-100 hover:border-blue-200 group active:scale-[0.98]"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 text-sm">Event</div>
              </div>
            </button>

            <button
              type="button"
              onClick={handleSelectTask}
              className="flex items-center gap-3.5 w-full p-3.5 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-900 font-semibold text-sm transition-all text-left border border-emerald-100 hover:border-emerald-200 group active:scale-[0.98]"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                <CheckSquare className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 text-sm">Task</div>
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
