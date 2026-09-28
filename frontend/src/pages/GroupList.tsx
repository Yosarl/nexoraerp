import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { ledgerGroupApi } from '../services/api';
import { isPrimaryHead } from './GroupCreate';

type RawGroup = {
  _id: string;
  name: string;
  code: string;
  type?: string;
  parentGroupId?: string | { _id: string; name?: string; code?: string } | null;
  isReceivables?: boolean;
  isPayables?: boolean;
  isBank?: boolean;
};

interface TreeNode {
  _id: string;
  code: string;
  name: string;
  type: string;
  root: boolean;
  parentId: string | null;
  children: TreeNode[];
}

interface TypeConfig {
  key: string;
  label: string;
  colorVar: string;
}

const TYPE_CONFIGS: TypeConfig[] = [
  { key: 'ASSET', label: 'Asset', colorVar: 'asset' },
  { key: 'LIABILITY', label: 'Liability', colorVar: 'liability' },
  { key: 'EQUITY', label: 'Equity', colorVar: 'equity' },
  { key: 'INCOME', label: 'Income', colorVar: 'income' },
  { key: 'EXPENSE', label: 'Expense', colorVar: 'expense' },
  { key: 'DUTIES AND TAXES', label: 'Duties and Taxes', colorVar: 'duties' },
];

function normalizeType(t?: string): string {
  if (!t) return 'OTHER';
  const upper = t.toUpperCase().trim();
  if (upper.includes('DUT')) return 'DUTIES AND TAXES';
  if (upper.includes('ASSET')) return 'ASSET';
  if (upper.includes('LIAB')) return 'LIABILITY';
  if (upper.includes('EQUITY') || upper.includes('CAPITAL')) return 'EQUITY';
  if (upper.includes('INC') || upper.includes('REV')) return 'INCOME';
  if (upper.includes('EXP')) return 'EXPENSE';
  return upper;
}

export default function GroupList() {
  const navigate = useNavigate();
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);

  const [rawGroups, setRawGroups] = useState<RawGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState('ALL');
  const [treeView, setTreeView] = useState(true);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(TYPE_CONFIGS.map((t) => t.key))
  );

  // Mobile sidebar state
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch groups
  const fetchGroups = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    ledgerGroupApi
      .list(companyId)
      .then((res) => {
        setRawGroups((res.data.data as RawGroup[]) ?? []);
      })
      .catch((err) => {
        console.error('Failed to load ledger groups:', err);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement !== searchInputRef.current &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Build tree & flat mappings
  const { groupMap, typeGroupsMap, totalCount } = useMemo(() => {
    const map: Record<string, RawGroup> = {};
    rawGroups.forEach((g) => {
      map[g._id] = g;
    });

    const groupsByType: Record<string, RawGroup[]> = {};
    TYPE_CONFIGS.forEach((tc) => {
      groupsByType[tc.key] = [];
    });

    rawGroups.forEach((g) => {
      const norm = normalizeType(g.type);
      if (!groupsByType[norm]) {
        groupsByType[norm] = [];
      }
      groupsByType[norm].push(g);
    });

    return {
      groupMap: map,
      typeGroupsMap: groupsByType,
      totalCount: rawGroups.length,
    };
  }, [rawGroups]);

  // Helper to get parent ID string
  const getParentId = useCallback((g: RawGroup): string | null => {
    if (!g.parentGroupId) return null;
    if (typeof g.parentGroupId === 'object' && g.parentGroupId !== null) {
      return g.parentGroupId._id ?? null;
    }
    return String(g.parentGroupId);
  }, []);

  // Filter and build tree per type
  const processedSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return TYPE_CONFIGS.map((typeConfig) => {
      const groupsInType = typeGroupsMap[typeConfig.key] || [];

      // 1. Identify roots (primary heads or groups with no parent/parent not in this type)
      const roots: TreeNode[] = [];
      const nodeMap: Record<string, TreeNode> = {};

      groupsInType.forEach((g) => {
        const isRoot = isPrimaryHead(g) || !getParentId(g);
        const node: TreeNode = {
          _id: g._id,
          code: g.code,
          name: g.name,
          type: g.type || typeConfig.label,
          root: isRoot,
          parentId: getParentId(g),
          children: [],
        };
        nodeMap[g._id] = node;
      });

      // Build hierarchy
      groupsInType.forEach((g) => {
        const node = nodeMap[g._id];
        const pId = getParentId(g);
        if (pId && nodeMap[pId] && nodeMap[pId] !== node) {
          nodeMap[pId].children.push(node);
        } else {
          roots.push(node);
        }
      });

      // If search query is present, filter roots and children
      const filterNode = (node: TreeNode): TreeNode | null => {
        const matchesSelf =
          !q ||
          node.name.toLowerCase().includes(q) ||
          node.code.toLowerCase().includes(q);

        const filteredChildren = node.children
          .map(filterNode)
          .filter((c): c is TreeNode => c !== null);

        if (matchesSelf || filteredChildren.length > 0) {
          return {
            ...node,
            children: matchesSelf && !q ? node.children : filteredChildren,
          };
        }
        return null;
      };

      const filteredRoots = roots
        .map(filterNode)
        .filter((r): r is TreeNode => r !== null);

      // Flat list for Flat view
      const flatList = groupsInType.filter((g) => {
        if (!q) return true;
        return (
          g.name.toLowerCase().includes(q) ||
          g.code.toLowerCase().includes(q)
        );
      });

      const count = groupsInType.length;
      const filteredCount = filteredRoots.reduce(
        (acc, r) => acc + 1 + r.children.length,
        0
      );

      return {
        ...typeConfig,
        roots: filteredRoots,
        flatList,
        totalInType: count,
        filteredCount,
      };
    });
  }, [searchQuery, typeGroupsMap, getParentId]);

  // Overall visible count
  const visibleGroupsCount = useMemo(() => {
    return processedSections
      .filter((s) => activeType === 'ALL' || activeType === s.key)
      .reduce((sum, s) => sum + s.filteredCount, 0);
  }, [processedSections, activeType]);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Search highlighter
  const renderHighlighted = (text: string) => {
    const q = searchQuery.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}
        <mark className="gl-mark">{match}</mark>
        {after}
      </>
    );
  };

  return (
    <div className="gl-app">
      <style>{`
        :root {
          --gl-bg: #f8fafc;
          --gl-surface: #ffffff;
          --gl-surface-2: #f1f5f9;
          --gl-rail-bg: #ffffff;
          --gl-ink: #0f172a;
          --gl-ink-soft: #334155;
          --gl-muted: #64748b;
          --gl-faint: #94a3b8;
          --gl-border: #e2e8f0;
          --gl-border-strong: #cbd5e1;
          --gl-accent: #2563eb;
          --gl-accent-ink: #ffffff;
          --gl-accent-wash: #eff6ff;
          --gl-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
          --gl-shadow-lg: 0 16px 32px rgba(15, 23, 42, 0.12), 0 4px 12px rgba(15, 23, 42, 0.06);

          --gl-asset: #0d9488;
          --gl-asset-wash: #f0fdfa;
          --gl-liability: #dc2626;
          --gl-liability-wash: #fef2f2;
          --gl-duties: #d97706;
          --gl-duties-wash: #fffbeb;
          --gl-equity: #7c3aed;
          --gl-equity-wash: #f5f3ff;
          --gl-income: #2563eb;
          --gl-income-wash: #eff6ff;
          --gl-expense: #ea580c;
          --gl-expense-wash: #fff7ed;
        }

        .gl-app {
          display: flex;
          flex-direction: column;
          min-height: calc(100vh - 100px);
          background: var(--gl-bg);
          color: var(--gl-ink);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          position: relative;
        }

        /* Topbar */
        .gl-topbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 24px;
          background: var(--gl-surface);
          border-bottom: 1px solid var(--gl-border);
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .gl-brand {
          display: flex;
          align-items: baseline;
          gap: 8px;
          min-width: 0;
        }
        .gl-brand .crumb-root {
          color: var(--gl-muted);
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
        }
        .gl-brand .crumb-sep {
          color: var(--gl-faint);
          font-size: 13px;
        }
        .gl-brand h1 {
          font-size: 17px;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.01em;
          white-space: nowrap;
          color: var(--gl-ink);
        }

        .gl-search-wrap {
          flex: 1;
          max-width: 440px;
          position: relative;
        }
        .gl-search-wrap svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--gl-faint);
        }
        .gl-search-wrap input {
          width: 100%;
          background: var(--gl-bg);
          border: 1px solid var(--gl-border);
          border-radius: 9px;
          padding: 9px 36px 9px 36px;
          font-size: 13.5px;
          color: var(--gl-ink);
          outline: none;
          transition: border-color 0.15s, background 0.15s;
        }
        .gl-search-wrap input:focus {
          border-color: var(--gl-accent);
          background: var(--gl-surface);
        }
        .gl-search-kbd {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 11px;
          color: var(--gl-faint);
          border: 1px solid var(--gl-border);
          border-radius: 4px;
          padding: 1px 6px;
          pointer-events: none;
          background: var(--gl-surface);
          font-family: monospace;
        }

        .gl-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 9px 16px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: filter 0.12s, transform 0.12s;
          box-shadow: 0 1px 2px rgba(37, 99, 235, 0.2);
        }
        .gl-btn-primary:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }
        .gl-btn-primary:active {
          transform: translateY(0);
        }

        /* Body */
        .gl-body {
          display: flex;
          flex: 1;
          min-height: 0;
        }

        /* Rail */
        .gl-rail {
          width: 250px;
          flex: none;
          background: var(--gl-rail-bg);
          border-right: 1px solid var(--gl-border);
          padding: 20px 14px 24px;
          overflow-y: auto;
        }
        .gl-rail-totals {
          background: var(--gl-surface-2);
          border: 1px solid var(--gl-border);
          border-radius: 10px;
          padding: 12px 14px;
          margin: 0 2px 20px;
        }
        .gl-rail-totals .big {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--gl-ink);
        }
        .gl-rail-totals .cap {
          font-size: 12px;
          color: var(--gl-muted);
          margin-top: 2px;
        }

        .gl-rail-label {
          font-size: 11.5px;
          font-weight: 600;
          color: var(--gl-faint);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 0 8px 8px;
        }
        .gl-type-filter {
          list-style: none;
          margin: 0 0 22px;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .gl-type-filter button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          background: transparent;
          border: none;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13.5px;
          font-weight: 500;
          color: var(--gl-ink-soft);
          cursor: pointer;
          text-align: left;
          transition: background 0.15s;
        }
        .gl-type-filter button:hover {
          background: var(--gl-surface-2);
        }
        .gl-type-filter button.active {
          background: var(--gl-accent-wash);
          color: var(--gl-accent);
          font-weight: 600;
        }
        .gl-type-filter .swatch {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex: none;
        }
        .gl-type-filter .tname {
          flex: 1;
        }
        .gl-type-filter .tcount {
          font-size: 12px;
          color: var(--gl-faint);
          font-weight: 600;
        }
        .gl-type-filter button.active .tcount {
          color: var(--gl-accent);
        }

        .gl-rail-foot {
          font-size: 12px;
          color: var(--gl-faint);
          padding: 0 8px;
          line-height: 1.5;
          border-top: 1px dashed var(--gl-border);
          padding-top: 16px;
        }

        /* Main area */
        .gl-main {
          flex: 1;
          min-width: 0;
          overflow-y: auto;
          padding: 24px 32px 60px;
        }
        .gl-main-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
        }
        .gl-main-head h2 {
          margin: 0 0 4px;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.015em;
          color: var(--gl-ink);
        }
        .gl-main-head p {
          margin: 0;
          font-size: 13.5px;
          color: var(--gl-muted);
        }
        .gl-view-toggle {
          display: flex;
          background: var(--gl-surface);
          border: 1px solid var(--gl-border);
          border-radius: 8px;
          padding: 2px;
          flex: none;
        }
        .gl-view-toggle button {
          border: none;
          background: transparent;
          padding: 6px 14px;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--gl-muted);
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .gl-view-toggle button.active {
          background: var(--gl-surface-2);
          color: var(--gl-ink);
          box-shadow: var(--gl-shadow);
        }

        /* Sections */
        .gl-section {
          background: var(--gl-surface);
          border: 1px solid var(--gl-border);
          border-radius: 12px;
          margin-bottom: 16px;
          overflow: hidden;
          box-shadow: var(--gl-shadow);
          transition: box-shadow 0.15s;
        }
        .gl-section:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }
        .gl-section-head {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 13px 18px;
          cursor: pointer;
          user-select: none;
          border-bottom: 1px solid transparent;
          background: #ffffff;
        }
        .gl-section.open .gl-section-head {
          border-bottom-color: var(--gl-border);
        }
        .gl-section-head .chev {
          color: var(--gl-faint);
          transition: transform 0.15s;
          flex: none;
        }
        .gl-section.open .gl-section-head .chev {
          transform: rotate(90deg);
        }
        .gl-type-pill {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 3px 10px;
          border-radius: 6px;
          flex: none;
        }
        .gl-section-head .scount {
          margin-left: auto;
          font-size: 12.5px;
          color: var(--gl-muted);
          font-weight: 500;
        }

        .gl-tree {
          padding: 6px 12px 14px;
        }
        .gl-node {
          position: relative;
        }
        .gl-node-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 10px;
          border-radius: 7px;
          font-size: 13.5px;
          transition: background 0.1s;
        }
        .gl-node-row:hover {
          background: var(--gl-surface-2);
        }
        .gl-node-row .name {
          color: var(--gl-ink-soft);
          font-weight: 500;
        }
        .gl-node.root > .gl-node-row .name {
          color: var(--gl-ink);
          font-weight: 700;
        }
        .gl-primary-head-tag {
          margin-left: 9px;
          font-size: 10px;
          font-weight: 700;
          color: var(--gl-muted);
          text-transform: uppercase;
          letter-spacing: 0.03em;
          background: var(--gl-surface-2);
          border: 1px solid var(--gl-border);
          padding: 1px 7px;
          border-radius: 5px;
          vertical-align: middle;
        }
        .gl-node-row .code {
          font-size: 11.5px;
          font-weight: 600;
          color: var(--gl-muted);
          background: var(--gl-surface-2);
          border: 1px solid var(--gl-border);
          border-radius: 5px;
          padding: 2px 7px;
          flex: none;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .gl-node-row .spacer {
          flex: 1;
        }
        .gl-node-row .child-count {
          font-size: 11.5px;
          color: var(--gl-faint);
          font-weight: 500;
          flex: none;
        }

        .gl-children {
          margin-left: 21px;
          padding-left: 15px;
          border-left: 1px solid var(--gl-border);
        }

        /* Flat View Table */
        .gl-flat-list {
          padding: 6px 12px 12px;
        }
        .gl-flat-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 10px;
          border-radius: 7px;
          font-size: 13.5px;
          border-bottom: 1px solid #f8fafc;
        }
        .gl-flat-row:hover {
          background: var(--gl-surface-2);
        }

        .gl-empty-state {
          padding: 56px 20px;
          text-align: center;
          color: var(--gl-muted);
        }
        .gl-empty-state svg {
          margin-bottom: 12px;
          color: var(--gl-faint);
        }
        .gl-empty-state p {
          margin: 0;
          font-size: 14px;
        }

        .gl-mark {
          background: var(--gl-accent-wash);
          color: var(--gl-ink);
          border-radius: 3px;
          padding: 0 2px;
          font-weight: 600;
        }
          color: #10b981;
          flex: none;
        }

        /* Mobile responsive */
        .gl-menu-btn {
          display: none;
          background: none;
          border: 1px solid var(--gl-border);
          border-radius: 8px;
          padding: 7px;
          color: var(--gl-ink-soft);
          cursor: pointer;
          flex: none;
        }

        @media (max-width: 860px) {
          .gl-brand .crumb-root,
          .gl-brand .crumb-sep {
            display: none;
          }
          .gl-rail {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            z-index: 40;
            transform: translateX(-100%);
            transition: transform 0.2s ease;
            box-shadow: var(--gl-shadow-lg);
          }
          .gl-rail.show {
            transform: translateX(0);
          }
          .gl-rail-scrim {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.4);
            z-index: 35;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.18s;
          }
          .gl-rail-scrim.show {
            opacity: 1;
            pointer-events: auto;
          }
          .gl-menu-btn {
            display: flex;
          }
          .gl-search-wrap {
            max-width: none;
          }
          .gl-search-kbd {
            display: none;
          }
          .gl-main {
            padding: 18px 16px 50px;
          }
          .gl-btn-primary span.label {
            display: none;
          }
        }
      `}</style>

      {/* Topbar */}
      <header className="gl-topbar">
        <button
          className="gl-menu-btn"
          onClick={() => setMobileRailOpen(true)}
          aria-label="Toggle groups menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="gl-brand">
          <span className="crumb-root">Master</span>
          <span className="crumb-sep">/</span>
          <h1>Account Groups</h1>
        </div>

        <div className="gl-search-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Find a group by code or name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
          />
          <span className="gl-search-kbd">/</span>
        </div>

        <button className="gl-btn-primary" onClick={() => navigate('/master/groups/create')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="label">Add group</span>
        </button>
      </header>

      {/* Body */}
      <div className="gl-body">
        {/* Mobile Scrim */}
        <div
          className={`gl-rail-scrim ${mobileRailOpen ? 'show' : ''}`}
          onClick={() => setMobileRailOpen(false)}
        />

        {/* Left Rail */}
        <aside className={`gl-rail ${mobileRailOpen ? 'show' : ''}`}>
          <div className="gl-rail-totals">
            <div className="big">{totalCount}</div>
            <div className="cap">groups across {TYPE_CONFIGS.length} account types</div>
          </div>

          <div className="gl-rail-label">Filter by type</div>
          <ul className="gl-type-filter">
            <li>
              <button
                className={activeType === 'ALL' ? 'active' : ''}
                onClick={() => {
                  setActiveType('ALL');
                  setMobileRailOpen(false);
                }}
              >
                <span className="swatch" style={{ background: '#64748b' }} />
                <span className="tname">All types</span>
                <span className="tcount">{totalCount}</span>
              </button>
            </li>
            {TYPE_CONFIGS.map((tc) => {
              const count = (typeGroupsMap[tc.key] || []).length;
              const colorHex =
                tc.colorVar === 'asset'
                  ? '#0d9488'
                  : tc.colorVar === 'liability'
                  ? '#dc2626'
                  : tc.colorVar === 'equity'
                  ? '#7c3aed'
                  : tc.colorVar === 'duties'
                  ? '#d97706'
                  : tc.colorVar === 'income'
                  ? '#2563eb'
                  : '#ea580c';

              return (
                <li key={tc.key}>
                  <button
                    className={activeType === tc.key ? 'active' : ''}
                    onClick={() => {
                      setActiveType(tc.key);
                      setMobileRailOpen(false);
                    }}
                  >
                    <span className="swatch" style={{ background: colorHex }} />
                    <span className="tname">{tc.label}</span>
                    <span className="tcount">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="gl-rail-foot">
            Groups define where ledger accounts post on the balance sheet and P&amp;L.
            Primary heads sit at the top of each category.
          </div>
        </aside>

        {/* Main Content */}
        <main className="gl-main">
          <div className="gl-main-head">
            <div>
              <h2>{activeType === 'ALL' ? 'All groups' : `${activeType} Groups`}</h2>
              <p>
                {searchQuery.trim()
                  ? `${visibleGroupsCount} group${visibleGroupsCount === 1 ? '' : 's'} match "${searchQuery.trim()}"`
                  : `${visibleGroupsCount} group${visibleGroupsCount === 1 ? '' : 's'}, organised by type and hierarchy`}
              </p>
            </div>
            <div className="gl-view-toggle">
              <button
                className={treeView ? 'active' : ''}
                onClick={() => setTreeView(true)}
              >
                Tree
              </button>
              <button
                className={!treeView ? 'active' : ''}
                onClick={() => setTreeView(false)}
              >
                Flat
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
              Loading account groups...
            </div>
          ) : (
            <div className="gl-sections">
              {processedSections
                .filter((s) => activeType === 'ALL' || activeType === s.key)
                .map((sec) => {
                  const isOpen = openSections.has(sec.key);
                  const pillColor = `var(--gl-${sec.colorVar})`;
                  const pillWash = `var(--gl-${sec.colorVar}-wash)`;

                  if (sec.filteredCount === 0 && searchQuery.trim()) {
                    return null;
                  }

                  return (
                    <div key={sec.key} className={`gl-section ${isOpen ? 'open' : ''}`}>
                      <div
                        className="gl-section-head"
                        onClick={() => toggleSection(sec.key)}
                      >
                        <svg
                          className="chev"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span
                          className="gl-type-pill"
                          style={{ background: pillWash, color: pillColor }}
                        >
                          {sec.label.toUpperCase()}
                        </span>
                        <span className="scount">
                          {sec.filteredCount} group{sec.filteredCount === 1 ? '' : 's'}
                        </span>
                      </div>

                      {isOpen && (
                        <>
                          {treeView ? (
                            <div className="gl-tree">
                              {sec.roots.length === 0 ? (
                                <div style={{ padding: '16px', color: '#94a3b8', fontSize: '13px' }}>
                                  No groups found under {sec.label}.
                                </div>
                              ) : (
                                sec.roots.map((r) => (
                                  <div
                                    key={r._id}
                                    className={`gl-node ${r.root ? 'root' : ''}`}
                                  >
                                    <div className="gl-node-row">
                                      <span className="code">{renderHighlighted(r.code)}</span>
                                      <span className="name">{renderHighlighted(r.name)}</span>
                                      {r.root && (
                                        <span className="gl-primary-head-tag">Primary head</span>
                                      )}
                                      <span className="spacer" />
                                      {r.children.length > 0 && (
                                        <span className="child-count">
                                          {r.children.length} sub-group{r.children.length === 1 ? '' : 's'}
                                        </span>
                                      )}
                                    </div>

                                    {r.children.length > 0 && (
                                      <div className="gl-children">
                                        {r.children.map((c) => (
                                          <div key={c._id} className="gl-node">
                                            <div className="gl-node-row">
                                              <span className="code">{renderHighlighted(c.code)}</span>
                                              <span className="name">{renderHighlighted(c.name)}</span>
                                              <span className="spacer" />
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          ) : (
                            <div className="gl-flat-list">
                              {sec.flatList.length === 0 ? (
                                <div style={{ padding: '16px', color: '#94a3b8', fontSize: '13px' }}>
                                  No groups found.
                                </div>
                              ) : (
                                sec.flatList.map((g) => {
                                  const pId = getParentId(g);
                                  const parentName = pId ? groupMap[pId]?.name : null;
                                  return (
                                    <div key={g._id} className="gl-flat-row">
                                      <span className="code mono" style={{ fontSize: '12px' }}>
                                        {renderHighlighted(g.code)}
                                      </span>
                                      <span className="name" style={{ fontWeight: 600 }}>
                                        {renderHighlighted(g.name)}
                                      </span>
                                      <span className="spacer" />
                                      {parentName ? (
                                        <span
                                          style={{
                                            fontSize: '11px',
                                            color: '#64748b',
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: 4,
                                            padding: '2px 8px',
                                          }}
                                        >
                                          Under: {parentName}
                                        </span>
                                      ) : (
                                        <span className="gl-primary-head-tag">Primary head</span>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

              {visibleGroupsCount === 0 && !loading && (
                <div className="gl-empty-state">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <p>
                    No groups match “{searchQuery.trim()}”. Try a different code or group name.
                  </p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
