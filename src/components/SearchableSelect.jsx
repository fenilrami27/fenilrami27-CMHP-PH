import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import './SearchableSelect.css'

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select an item...',
  disabled = false,
  isLocked = false,
  lockedTooltip = '',
  emptyStateMessage = 'No items found.',
  navigateToModulePath = null,
  navigateToModuleLabel = 'Go to Module',
  canNavigate = false,
  labelKey = 'name',
  codeKey = 'code',
  valueKey = 'id',
  required = false,
  id,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef(null)
  const searchInputRef = useRef(null)
  const listRef = useRef(null)
  const navigate = useNavigate()

  // Selected item lookup
  const selectedItem = useMemo(() => {
    if (value === undefined || value === null || value === '') return null
    return (
      options.find(
        (opt) =>
          String(opt[valueKey]) === String(value) ||
          String(opt[labelKey]) === String(value) ||
          (opt[codeKey] && String(opt[codeKey]) === String(value))
      ) || null
    )
  }, [value, options, valueKey, labelKey, codeKey])

  // Filtered options based on searchQuery (matching name AND code)
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options
    const q = searchQuery.trim().toLowerCase()
    return options.filter((opt) => {
      const name = String(opt[labelKey] || '').toLowerCase()
      const code = String(opt[codeKey] || '').toLowerCase()
      return name.includes(q) || code.includes(q)
    })
  }, [options, searchQuery, labelKey, codeKey])

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setActiveIndex(0)
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus()
        }
      }, 50)
    }
  }, [isOpen])

  // Scroll active option into view
  useEffect(() => {
    if (isOpen && listRef.current && activeIndex >= 0) {
      const activeEl = listRef.current.children[activeIndex]
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [activeIndex, isOpen])

  const handleToggle = () => {
    if (disabled || isLocked) return
    setIsOpen(!isOpen)
  }

  const handleSelect = (item) => {
    if (onChange) {
      onChange(item)
    }
    setIsOpen(false)
  }

  const handleClear = (e) => {
    e.stopPropagation()
    if (disabled || isLocked) return
    if (onChange) {
      onChange(null)
    }
    setSearchQuery('')
  }

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredOptions[activeIndex]) {
        handleSelect(filteredOptions[activeIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    }
  }

  return (
    <div
      className="searchable-select-wrap"
      ref={containerRef}
      onKeyDown={handleKeyDown}
      title={isLocked && lockedTooltip ? lockedTooltip : undefined}
    >
      {/* Trigger / Select box */}
      <div
        id={id}
        tabIndex={disabled || isLocked ? -1 : 0}
        className={`searchable-select-trigger ${
          isOpen ? 'is-open' : ''
        } ${disabled ? 'is-disabled' : ''} ${
          isLocked ? 'is-locked' : ''
        }`}
        onClick={handleToggle}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="searchable-select-value">
          {selectedItem ? (
            <>
              <span style={{ fontWeight: 600 }}>
                {selectedItem[labelKey]}
              </span>
              {selectedItem[codeKey] && (
                <span className="searchable-select-badge">
                  {selectedItem[codeKey]}
                </span>
              )}
            </>
          ) : (
            <span className="searchable-select-placeholder">
              {placeholder}
            </span>
          )}
        </div>

        <div className="searchable-select-actions">
          {isLocked && (
            <span
              className="searchable-select-locked-badge"
              title={lockedTooltip}
            >
              🔒 Locked
            </span>
          )}

          {!disabled && !isLocked && selectedItem && (
            <button
              type="button"
              className="searchable-select-clear-btn"
              onClick={handleClear}
              aria-label="Clear selection"
              title="Clear selection"
            >
              ✕
            </button>
          )}

          <span
            className={`searchable-select-arrow ${
              isOpen ? 'is-open' : ''
            }`}
          >
            ▼
          </span>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="searchable-select-dropdown">
          {options.length === 0 ? (
            <div className="searchable-select-empty-state">
              <div className="searchable-select-empty-msg">
                {emptyStateMessage}
              </div>
              {canNavigate && navigateToModulePath && (
                <button
                  type="button"
                  className="searchable-select-link-btn"
                  onClick={() => {
                    setIsOpen(false)
                    navigate(navigateToModulePath)
                  }}
                >
                  {navigateToModuleLabel}
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Type-to-filter Search Input */}
              <div className="searchable-select-search-box">
                <input
                  ref={searchInputRef}
                  type="text"
                  className="searchable-select-search-input"
                  placeholder="Type to filter by name or code..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setActiveIndex(0)
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Options list */}
              <ul
                className="searchable-select-options-list"
                ref={listRef}
                role="listbox"
              >
                {filteredOptions.length === 0 ? (
                  <li className="searchable-select-no-results">
                    No matching product found
                  </li>
                ) : (
                  filteredOptions.map((opt, idx) => {
                    const isSelected =
                      selectedItem &&
                      String(selectedItem[valueKey]) === String(opt[valueKey])
                    const isActive = idx === activeIndex

                    return (
                      <li
                        key={opt[valueKey] || opt[codeKey] || idx}
                        className={`searchable-select-option ${
                          isSelected ? 'is-selected' : ''
                        } ${isActive ? 'is-active' : ''}`}
                        onClick={() => handleSelect(opt)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <div>
                          <strong>{opt[labelKey]}</strong>
                          {opt[codeKey] && (
                            <span style={{ color: '#64748b', marginLeft: 6 }}>
                              ({opt[codeKey]})
                            </span>
                          )}
                          {opt.category && (
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              {opt.category}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <span style={{ color: '#2563eb', fontWeight: 'bold' }}>
                            ✓
                          </span>
                        )}
                      </li>
                    )
                  })
                )}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
