import React, { useState, useEffect } from 'react';
import { User, Phone, MapPin, FileText, Mail, IndianRupee, Save, X } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useCustomerStore } from '../../store/useCustomerStore';
import { Customer } from '../../types';

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName?: string;
  onCustomerCreated: (customer: Customer) => void;
}

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({
  isOpen,
  onClose,
  initialName = '',
  onCustomerCreated
}) => {
  const addCustomer = useCustomerStore((state) => state.addCustomer);

  const [name, setName] = useState(initialName);
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setMobile('');
      setAddress('');
      setCity('');
      setGstin('');
      setEmail('');
      setCreditBalance(0);
      setNotes('');
      setError('');
    }
  }, [isOpen, initialName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Customer Name is required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const created = await addCustomer({
        name: name.trim(),
        mobile: mobile.trim(),
        address: address.trim(),
        city: city.trim(),
        gstin: gstin.trim().toUpperCase(),
        email: email.trim(),
        creditBalance: Number(creditBalance) || 0,
        notes: notes.trim(),
        isActive: true
      });

      onCustomerCreated(created);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Contact / Client"
      subtitle="Save customer contact details to database for fast billing"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        {error && (
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Customer Name */}
        <div>
          <label className="block text-[#172B4D] font-bold mb-1 uppercase tracking-wider text-[11px]">
            Customer / Client Name <span className="text-red-600 font-black">*</span>
          </label>
          <div className="flex items-center gap-2 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg px-3 py-2 focus-within:border-[#2563EB] focus-within:ring-1 focus-within:ring-[#2563EB]">
            <User className="w-4 h-4 text-[#2563EB] shrink-0" />
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Rahul Sharma / Saraswati Book Depot"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-transparent text-[#172B4D] placeholder-[#94A3B8] focus:outline-none font-semibold text-xs"
            />
          </div>
        </div>

        {/* Mobile Number & GSTIN */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[#172B4D] font-bold mb-1 uppercase tracking-wider text-[11px]">
              Mobile Number
            </label>
            <div className="flex items-center gap-2 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg px-3 py-2 focus-within:border-[#2563EB] focus-within:ring-1 focus-within:ring-[#2563EB]">
              <Phone className="w-4 h-4 text-[#64748B] shrink-0" />
              <input
                type="tel"
                placeholder="10 digit number"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full bg-transparent text-[#172B4D] placeholder-[#94A3B8] focus:outline-none font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#172B4D] font-bold mb-1 uppercase tracking-wider text-[11px]">
              GSTIN (Optional)
            </label>
            <div className="flex items-center gap-2 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg px-3 py-2 focus-within:border-[#2563EB] focus-within:ring-1 focus-within:ring-[#2563EB]">
              <FileText className="w-4 h-4 text-[#64748B] shrink-0" />
              <input
                type="text"
                placeholder="15-digit GSTIN"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                className="w-full bg-transparent text-[#172B4D] placeholder-[#94A3B8] focus:outline-none font-mono uppercase text-xs"
              />
            </div>
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="block text-[#172B4D] font-bold mb-1 uppercase tracking-wider text-[11px]">
            Address / Location
          </label>
          <div className="flex items-center gap-2 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg px-3 py-2 focus-within:border-[#2563EB] focus-within:ring-1 focus-within:ring-[#2563EB]">
            <MapPin className="w-4 h-4 text-[#64748B] shrink-0" />
            <input
              type="text"
              placeholder="Shop No, Street, Landmark"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-transparent text-[#172B4D] placeholder-[#94A3B8] focus:outline-none text-xs"
            />
          </div>
        </div>

        {/* City & Email */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[#172B4D] font-bold mb-1 uppercase tracking-wider text-[11px]">
              City / Area
            </label>
            <input
              type="text"
              placeholder="e.g. Katangi / Balaghat"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563EB] text-xs text-[#172B4D]"
            />
          </div>

          <div>
            <label className="block text-[#172B4D] font-bold mb-1 uppercase tracking-wider text-[11px]">
              Opening Khata / Credit
            </label>
            <div className="flex items-center gap-2 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg px-3 py-2 focus-within:border-[#2563EB] focus-within:ring-1 focus-within:ring-[#2563EB]">
              <IndianRupee className="w-4 h-4 text-[#64748B] shrink-0" />
              <input
                type="number"
                min={0}
                placeholder="0.00"
                value={creditBalance || ''}
                onChange={(e) => setCreditBalance(parseFloat(e.target.value) || 0)}
                className="w-full bg-transparent text-[#172B4D] placeholder-[#94A3B8] focus:outline-none font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-3 border-t border-[#D8E1EC]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-[#D8E1EC] rounded-lg font-bold text-[#172B4D] hover:bg-[#F5F9FF] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : 'Save & Select Client'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
