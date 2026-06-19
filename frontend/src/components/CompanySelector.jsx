import React, { useState } from "react";
import { FaBuilding } from "react-icons/fa6";
import useStore from '../store';

const CompanySelector = () => {
  const selectedFirm = useStore((s) => s.selectedFirm);
  const firms = useStore((s) => s.firms);
  const setFirm = useStore((s) => s.setFirm);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs md:text-sm border border-neutral-300 bg-white text-neutral-800 rounded-md hover:bg-neutral-50"
        >
        <FaBuilding className="text-neutral-500" />
        <span>{selectedFirm ? `${selectedFirm.name} (${selectedFirm.type})` : 'Select Firm'}</span>
        {/* <FaChevronDown className="text-xs text-neutral-500" /> */}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-neutral-300 rounded-md shadow-lg z-50">
          {firms.map((firm) => (
            <button
              key={firm.id}
              onClick={() => {
                setFirm(firm);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs md:text-sm text-left hover:bg-neutral-50 ${
                selectedFirm?.id === firm.id ? 'bg-blue-50' : ''
              }`}
            >
              <span className="text-neutral-800">{firm.name}</span>
              <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800">
                {firm.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CompanySelector;
