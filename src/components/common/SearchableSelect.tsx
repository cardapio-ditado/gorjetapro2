import React, { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  error?: string;
  emptyMessage?: string;
  theme?: 'light' | 'dark';
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  label,
  disabled = false,
  required = false,
  className = '',
  error,
  emptyMessage = 'Nenhum item encontrado',
  theme = 'light'
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  const filteredOptions = options.filter(option => {
    const searchLower = search.toLowerCase();
    return (
      option.label.toLowerCase().includes(searchLower) ||
      option.sublabel?.toLowerCase().includes(searchLower)
    );
  });

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          onChange(filteredOptions[highlightedIndex].value);
          setIsOpen(false);
          setSearch('');
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearch('');
        break;
    }
  };

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  const isDark = theme === 'dark';

  return (
    <div className={className}>
      {label && (
        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={`
            w-full flex items-center justify-between gap-2 px-3 py-2
            ${isDark ? 'bg-gray-700' : 'bg-white'} border rounded-lg
            text-left text-sm
            transition-colors
            ${disabled ? 'opacity-50 cursor-not-allowed' : isDark ? 'hover:bg-gray-600 cursor-pointer' : 'hover:border-[#7D1F2C] cursor-pointer'}
            ${error ? 'border-red-500' : isDark ? 'border-gray-600' : 'border-gray-300'}
            ${isOpen ? isDark ? 'ring-2 ring-blue-500 border-blue-500' : 'ring-2 ring-[#7D1F2C] border-[#7D1F2C]' : ''}
          `}
        >
          <Search className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />

          <span className={`flex-1 truncate ${selectedOption ? (isDark ? 'text-white' : 'text-gray-900') : 'text-gray-400'}`}>
            {selectedOption?.label || placeholder}
          </span>

          <div className="flex items-center gap-2 flex-shrink-0">
            {value && !disabled && (
              <X
                className={`w-4 h-4 transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={handleClear}
              />
            )}
            <ChevronDown
              className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </div>
        </button>

        {isOpen && (
          <div
            className={`absolute z-[9999] w-full mt-1 ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'} border-2 rounded-lg shadow-2xl overflow-hidden`}
            style={{ maxHeight: '400px' }}
          >
            <div className={`p-3 ${isDark ? 'border-b-2 border-gray-700 bg-gray-750' : 'border-b-2 border-gray-200 bg-gray-50'}`}>
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${isDark ? 'text-gray-400' : 'text-[#7D1F2C]'}`} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite para buscar..."
                  autoFocus
                  className={`w-full pl-10 pr-3 py-2.5 border-2 rounded-lg text-sm font-medium placeholder-gray-400 focus:outline-none focus:ring-2 ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-white focus:ring-blue-500 focus:border-blue-500'
                      : 'bg-white border-gray-300 text-gray-900 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]'
                  }`}
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              {filteredOptions.length === 0 ? (
                <div className={`px-4 py-8 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  <Search className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">{emptyMessage}</p>
                  <p className="text-xs mt-1">Tente buscar por outro termo</p>
                </div>
              ) : (
                filteredOptions.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`
                      w-full px-4 py-3 text-left text-sm border-b last:border-b-0
                      transition-all duration-150
                      ${highlightedIndex === index
                        ? isDark ? 'bg-blue-600 text-white border-blue-700' : 'bg-[#7D1F2C] text-white border-[#6a1a25]'
                        : isDark ? 'text-gray-300 hover:bg-gray-700 border-gray-700' : 'text-gray-900 hover:bg-gray-50 border-gray-100'
                      }
                      ${option.value === value ? isDark ? 'bg-blue-600/30 font-semibold' : 'bg-[#7D1F2C]/20 font-semibold' : ''}
                    `}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      {option.sublabel && (
                        <span className={`text-xs mt-0.5 ${highlightedIndex === index ? isDark ? 'text-blue-100' : 'text-white/90' : 'text-gray-600'}`}>
                          {option.sublabel}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
