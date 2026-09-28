import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { useAppSelector } from '../store/hooks';
import { productApi } from '../services/api';

interface UnitInfo {
  _id: string;
  name?: string;
  shortCode?: string;
}

interface MultiUnitItem {
  multiUnitId?: string;
  imei?: string;
  conversion?: number;
  price?: number;
  totalPrice?: number;
  unitId?: UnitInfo | string;
  wholesale?: number;
  retail?: number;
  specialPrice1?: number;
  specialPrice2?: number;
}

interface ProductItem {
  _id: string;
  name: string;
  sku: string;
  code?: string;
  systemBarcode?: string;
  unitOfMeasureId?: UnitInfo | string;
  unit?: string;
  sellingPrice: number;
  retailPrice?: number;
  purchasePrice: number;
  wholesalePrice?: number;
  imei?: string;
  multiUnits?: MultiUnitItem[];
}

export default function ProductList() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 50;

  // Scroll indicator state
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [hasScrollMore, setHasScrollMore] = useState(false);

  // Multi Unit Dialog state
  const [multiUnitDialogOpen, setMultiUnitDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [detailedProduct, setDetailedProduct] = useState<ProductItem | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Delete Dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<ProductItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const navigate = useNavigate();
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);

  // Scroll check matching user's exact logic
  const checkScroll = useCallback(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const hasScroll = el.scrollHeight > el.clientHeight;
    const isScrolledToBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 10;
    setHasScrollMore(hasScroll && !isScrolledToBottom);
  }, []);

  const loadProducts = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    productApi
      .list(companyId, {
        search: search.trim() || undefined,
        page,
        limit,
      })
      .then((res) => {
        const d = res.data.data as { products: ProductItem[]; total: number };
        setProducts(d?.products ?? []);
        setTotal(d?.total ?? 0);
      })
      .catch(() => {
        setProducts([]);
        setTotal(0);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [companyId, search, page, limit]);

  // Fetch when companyId, debounced search, or page changes
  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  // Reset page to 1 on search change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  // Re-check scroll on content update or window resize
  useEffect(() => {
    const t = setTimeout(checkScroll, 120);
    window.addEventListener('resize', checkScroll);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', checkScroll);
    };
  }, [products, checkScroll]);

  // Double click handler to show Multi Unit details
  const handleOpenMultiUnit = useCallback(
    (p: ProductItem) => {
      setSelectedProduct(p);
      setDetailedProduct(p);
      setMultiUnitDialogOpen(true);

      // Fetch fresh full product details (including all populated multiUnits and prices)
      if (companyId) {
        setLoadingDetails(true);
        productApi
          .get(p._id, companyId)
          .then((res) => {
            const data = res.data?.data as ProductItem;
            if (data) {
              setDetailedProduct(data);
            }
          })
          .catch((err) => {
            console.error('Failed to load full product details', err);
          })
          .finally(() => {
            setLoadingDetails(false);
          });
      }
    },
    [companyId]
  );

  const handleConfirmDelete = async () => {
    if (!companyId || !productToDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await productApi.delete(productToDelete._id, companyId);
      setDeleteDialogOpen(false);
      setProductToDelete(null);
      loadProducts();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to delete product. It may be referenced in transactions.';
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const getUnitDisplay = (p: ProductItem): string => {
    if (p.unitOfMeasureId && typeof p.unitOfMeasureId === 'object') {
      return p.unitOfMeasureId.shortCode || p.unitOfMeasureId.name || '—';
    }
    return p.unit || '—';
  };

  const getMultiUnitName = (u: MultiUnitItem): string => {
    if (u.unitId && typeof u.unitId === 'object') {
      return u.unitId.shortCode || u.unitId.name || '—';
    }
    return String(u.unitId || '—');
  };

  if (!companyId) {
    return (
      <div className="pm-wrapper">
        <style>{scopedStyles}</style>
        <div className="container">
          <div className="empty-state" style={{ background: '#fff', borderRadius: '8px', padding: '40px' }}>
            <div className="empty-state-icon">🏢</div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: '#1a2332' }}>
              No Company Selected
            </h2>
            <p style={{ color: '#64748b' }}>Please select a company from the top navigation to view and manage products.</p>
          </div>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit) || 1;
  const activeProduct = detailedProduct || selectedProduct;
  const baseUnitLabel = activeProduct ? getUnitDisplay(activeProduct) : '—';
  const multiUnitsList = activeProduct?.multiUnits ?? [];

  return (
    <div className="pm-wrapper">
      <style>{scopedStyles}</style>

      <div className="container">
        {/* Header */}
        <div className="header">
          <div>
            <h1>Products</h1>
            <div className="double-click-hint">
              💡 Double-click any row to view <strong>Multi Unit Details</strong>
            </div>
          </div>
          <div className="header-actions">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search by name, SKU, or IMEI..."
                value={search}
                onChange={handleSearchChange}
              />
            </div>
            <button className="btn-add" onClick={() => navigate('/master/products/create')}>
              <span>+</span> Add Product
            </button>
          </div>
        </div>

        {/* Table Wrapper */}
        <div className="table-wrapper">
          {/* Table Header with Stats */}
          <div className="table-header">
            <div className="table-stats">
              <div className="stat-item">
                <span className="stat-label">Total Products:</span>
                <span className="stat-value">{total}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Showing:</span>
                <span className="stat-value">{products.length}</span>
              </div>
              {search && (
                <div className="stat-item">
                  <span className="stat-label">Filter:</span>
                  <span className="stat-value">"{search}"</span>
                </div>
              )}
            </div>
          </div>

          {/* Table Scroll Container */}
          <div
            className="table-scroll-container"
            id="tableScrollContainer"
            ref={tableScrollRef}
            onScroll={checkScroll}
          >
            <table>
              <thead>
                <tr>
                  <th style={{ width: '23%' }}>Name</th>
                  <th style={{ width: '15%' }}>SKU</th>
                  <th style={{ width: '15%' }}>IMEI</th>
                  <th style={{ width: '16%' }}>Multi Unit IMEI</th>
                  <th style={{ width: '11%', textAlign: 'right' }}>Selling (AED)</th>
                  <th style={{ width: '11%', textAlign: 'right' }}>Purchase (AED)</th>
                  <th style={{ width: '9%', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span className="spinner" /> Loading products...
                      </div>
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 0 }}>
                      <div className="empty-state">
                        <div className="empty-state-icon">📦</div>
                        <p>{search ? 'No products found matching your search.' : 'No products have been added yet.'}</p>
                        {!search && (
                          <button className="btn-add" onClick={() => navigate('/master/products/create')}>
                            <span>+</span> Add Your First Product
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  products.map((p) => {
                    const displaySku = p.sku || p.code || '—';
                    const displaySelling = Number(p.sellingPrice ?? p.retailPrice ?? 0).toFixed(2);
                    const displayPurchase = Number(p.purchasePrice ?? 0).toFixed(2);
                    const multiUnitImeis = p.multiUnits
                      ?.map((u) => u.imei?.trim())
                      .filter(Boolean)
                      .join(', ');
                    const hasMultiUnits = p.multiUnits && p.multiUnits.length > 0;

                    return (
                      <tr
                        key={p._id}
                        onDoubleClick={() => handleOpenMultiUnit(p)}
                        title="Double-click to view Multi Unit Details"
                      >
                        <td className="cell-name">{p.name}</td>
                        <td className="cell-sku">{displaySku}</td>
                        <td className={p.imei ? 'cell-imei' : 'cell-dash'}>{p.imei || '—'}</td>
                        <td className="cell-unit">
                          {multiUnitImeis ? (
                            <span className="cell-imei">{multiUnitImeis}</span>
                          ) : (
                            <span className="cell-dash">—</span>
                          )}
                          {hasMultiUnits && (
                            <span
                              className="multi-tag"
                              title={`${p.multiUnits!.length} Multi Units configured`}
                              style={{ marginLeft: '6px' }}
                            >
                              +{p.multiUnits!.length}
                            </span>
                          )}
                        </td>
                        <td className="cell-numeric cell-currency">{displaySelling}</td>
                        <td className="cell-numeric cell-currency">{displayPurchase}</td>
                        <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="btn-icon edit"
                              title="Edit Product"
                              onClick={() => navigate(`/master/products/create?edit=${p._id}`)}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="btn-icon delete"
                              title="Delete Product"
                              onClick={() => {
                                setProductToDelete(p);
                                setDeleteError(null);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <div className={`scroll-indicator ${hasScrollMore ? 'show' : ''}`} id="scrollIndicator">
              ↓ Scroll for more
            </div>
          </div>

          {/* Table Footer */}
          <div className="table-footer">
            <div>
              Showing {products.length > 0 ? (page - 1) * limit + 1 : 0}
              {products.length > 1 ? `-${(page - 1) * limit + products.length}` : ''} of {total} products
            </div>

            {totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  className="btn-page"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹ Prev
                </button>
                <span className="page-indicator">
                  {page} / {totalPages}
                </span>
                <button
                  className="btn-page"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next ›
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Multi Unit Details Dialog */}
      <Dialog
        open={multiUnitDialogOpen}
        onClose={() => setMultiUnitDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
            padding: '4px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, pt: 2, px: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a2332' }}>
                Multi Unit Details
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span>Product: <strong style={{ color: '#1a2332' }}>{activeProduct?.name}</strong></span>
                <span>SKU: <strong style={{ color: '#1a2332' }}>{activeProduct?.sku || activeProduct?.code || '—'}</strong></span>
                <span>Main Unit: <strong style={{ color: '#3b82f6' }}>{baseUnitLabel}</strong></span>
              </div>
            </div>
            {loadingDetails && (
              <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="spinner" /> refreshing...
              </span>
            )}
          </div>
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 1 }}>
          {multiUnitsList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📦</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a2332', marginBottom: '4px' }}>
                No Multi Units Configured
              </div>
              <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                This product only has its base unit (<strong>{baseUnitLabel}</strong>). Multi-units can be added in Product Registration.
              </div>
            </div>
          ) : (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b' }}>Unit</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#64748b' }}>Conversion</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b' }}>IMEI / Barcode</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>Retail (AED)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>Wholesale (AED)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>Special 1</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>Special 2</th>
                  </tr>
                </thead>
                <tbody>
                  {multiUnitsList.map((u, idx) => (
                    <tr key={u.multiUnitId || idx} style={{ borderBottom: idx === multiUnitsList.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#1a2332' }}>
                        {getMultiUnitName(u)}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>
                        {u.conversion ? `= ${u.conversion} ${baseUnitLabel}` : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', fontFamily: "'Courier New', monospace", fontWeight: 700, color: '#1e293b' }}>
                        {u.imei || '—'}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                        {u.retail !== undefined && u.retail !== null ? Number(u.retail).toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                        {u.wholesale !== undefined && u.wholesale !== null ? Number(u.wholesale).toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#475569' }}>
                        {u.specialPrice1 !== undefined && u.specialPrice1 !== null ? Number(u.specialPrice1).toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#475569' }}>
                        {u.specialPrice2 !== undefined && u.specialPrice2 !== null ? Number(u.specialPrice2).toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setMultiUnitDialogOpen(false)}
            sx={{
              color: '#64748b',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '13px',
              '&:hover': { background: '#f1f5f9' },
            }}
          >
            Close
          </Button>
          {activeProduct && (
            <Button
              variant="contained"
              onClick={() => {
                setMultiUnitDialogOpen(false);
                navigate(`/master/products/create?edit=${activeProduct._id}`);
              }}
              sx={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #0284c7 100%)',
                color: '#fff',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '13px',
                boxShadow: 'none',
              }}
            >
              Edit Product
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !deleting && setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
            padding: '4px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, pt: 2, px: 3, fontWeight: 700, fontSize: '17px', color: '#1a2332' }}>
          Delete Product
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 1 }}>
          <p style={{ color: '#475569', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
            Are you sure you want to delete <strong>{productToDelete?.name}</strong> (SKU: {productToDelete?.sku || productToDelete?.code || '—'})?
          </p>
          <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px', marginBottom: 0 }}>
            ⚠️ This action cannot be undone.
          </p>
          {deleteError && (
            <div
              style={{
                marginTop: '12px',
                padding: '8px 12px',
                background: '#fef2f2',
                color: '#b91c1c',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                fontSize: '12.5px',
              }}
            >
              {deleteError}
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleting}
            sx={{
              color: '#64748b',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '13px',
              '&:hover': { background: '#f1f5f9' },
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={deleting}
            onClick={handleConfirmDelete}
            sx={{
              background: '#ef4444',
              '&:hover': { background: '#dc2626' },
              color: '#fff',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '13px',
              boxShadow: 'none',
            }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

const scopedStyles = `
  .pm-wrapper {
    --bg-primary: #f8f9fb;
    --bg-secondary: #ffffff;
    --text-primary: #1a2332;
    --text-secondary: #64748b;
    --text-muted: #94a3b8;
    --border-color: #e2e8f0;
    --border-hover: #cbd5e1;
    --accent-primary: #3b82f6;
    --accent-secondary: #06b6d4;
    --status-success: #10b981;
    --status-warning: #f59e0b;
    --status-error: #ef4444;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
    --radius: 8px;
    --spacing-xs: 4px;
    --spacing-sm: 6px;
    --spacing-md: 12px;
    --spacing-lg: 16px;
    --spacing-xl: 20px;

    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    padding: var(--spacing-lg);
    min-height: 100%;
    box-sizing: border-box;
  }

  .pm-wrapper *,
  .pm-wrapper *::before,
  .pm-wrapper *::after {
    box-sizing: border-box;
  }

  .pm-wrapper .container {
    max-width: 1400px;
    margin: 0 auto;
  }

  .pm-wrapper .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
    flex-wrap: wrap;
  }

  .pm-wrapper .header h1 {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.4px;
    margin: 0;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .pm-wrapper .double-click-hint {
    font-size: 11.5px;
    color: var(--text-secondary);
    margin-top: 3px;
  }

  .pm-wrapper .header-actions {
    display: flex;
    gap: var(--spacing-md);
    align-items: center;
    flex-wrap: wrap;
  }

  .pm-wrapper .search-box {
    position: relative;
    flex: 1;
    min-width: 250px;
    max-width: 320px;
  }

  .pm-wrapper .search-box input {
    width: 100%;
    padding: 8px 14px 8px 36px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    font-size: 13px;
    font-family: inherit;
    transition: all 0.2s ease;
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .pm-wrapper .search-box input::placeholder {
    color: var(--text-muted);
  }

  .pm-wrapper .search-box input:hover {
    border-color: var(--border-hover);
    box-shadow: var(--shadow-sm);
  }

  .pm-wrapper .search-box input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .pm-wrapper .search-icon {
    position: absolute;
    left: 11px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    font-size: 14px;
    pointer-events: none;
    line-height: 1;
  }

  .pm-wrapper .btn-add {
    padding: 8px 16px;
    background: linear-gradient(135deg, var(--accent-primary) 0%, #0284c7 100%);
    color: white;
    border: none;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
    transition: all 0.2s ease;
    box-shadow: var(--shadow-sm);
    white-space: nowrap;
    text-decoration: none;
  }

  .pm-wrapper .btn-add:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .pm-wrapper .btn-add:active {
    transform: translateY(0);
  }

  /* Table Wrapper */
  .pm-wrapper .table-wrapper {
    background: var(--bg-secondary);
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
    overflow: hidden;
    border: 1px solid var(--border-color);
  }

  .pm-wrapper .table-header {
    padding: 10px 16px;
    border-bottom: 1.5px solid var(--border-color);
    background: linear-gradient(to right, #f8fafc 0%, #f1f5f9 100%);
  }

  .pm-wrapper .table-stats {
    display: flex;
    gap: var(--spacing-lg);
    font-size: 12px;
  }

  .pm-wrapper .stat-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pm-wrapper .stat-label {
    color: var(--text-muted);
    font-weight: 500;
  }

  .pm-wrapper .stat-value {
    color: var(--text-primary);
    font-weight: 700;
    font-size: 13.5px;
  }

  /* Table Scroll Container */
  .pm-wrapper .table-scroll-container {
    max-height: clamp(250px, calc(100vh - 270px), 640px);
    overflow-y: auto;
    position: relative;
  }

  .pm-wrapper .table-scroll-container::-webkit-scrollbar {
    width: 7px;
  }

  .pm-wrapper .table-scroll-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .pm-wrapper .table-scroll-container::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 4px;
  }

  .pm-wrapper .table-scroll-container::-webkit-scrollbar-thumb:hover {
    background: var(--border-hover);
  }

  .pm-wrapper .scroll-indicator {
    position: absolute;
    bottom: 8px;
    right: 8px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--accent-primary);
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid var(--border-color);
    padding: 2px 9px;
    border-radius: 16px;
    box-shadow: var(--shadow-sm);
    pointer-events: none;
    display: none;
    animation: bounce 1.5s infinite;
  }

  .pm-wrapper .scroll-indicator.show {
    display: block;
  }

  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }

  /* Table */
  .pm-wrapper table {
    width: 100%;
    border-collapse: collapse;
  }

  .pm-wrapper thead th {
    padding: 9px 14px;
    text-align: left;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-color);
    vertical-align: middle;
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .pm-wrapper tbody td {
    padding: 8px 14px;
    border-bottom: 1px solid var(--border-color);
    color: var(--text-primary);
    vertical-align: middle;
    font-size: 12.5px;
  }

  .pm-wrapper tbody tr {
    transition: background-color 0.15s ease;
    cursor: pointer;
    user-select: none;
  }

  .pm-wrapper tbody tr:hover {
    background-color: #f1f5f9;
  }

  .pm-wrapper tbody tr:last-child td {
    border-bottom: none;
  }

  /* Cell Styling - Reduced Size & Bold fields */
  .pm-wrapper .cell-name {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 13px;
  }

  .pm-wrapper .cell-sku {
    font-family: 'Courier New', monospace;
    color: #0f172a;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.2px;
  }

  .pm-wrapper .cell-imei {
    font-family: 'Courier New', monospace;
    color: #0f172a;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.2px;
  }

  .pm-wrapper .cell-unit {
    color: #0f172a;
    font-weight: 700;
    font-size: 12.5px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 10px;
    padding-bottom: 10px;
  }

  .pm-wrapper .unit-tag {
    font-weight: 700;
    color: #0f172a;
  }

  .pm-wrapper .multi-tag {
    background: #e0f2fe;
    color: #0369a1;
    font-size: 10.5px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid #bae6fd;
    line-height: 1.2;
  }

  .pm-wrapper .cell-numeric {
    text-align: right;
    font-weight: 600;
    font-family: 'Segoe UI', Roboto, sans-serif;
  }

  .pm-wrapper .cell-currency {
    color: var(--status-success);
    font-weight: 600;
  }

  .pm-wrapper .cell-dash {
    color: var(--text-muted);
    text-align: center;
    font-weight: 400;
  }

  /* Actions Column */
  .pm-wrapper .cell-actions {
    text-align: center;
    vertical-align: middle;
  }

  .pm-wrapper .action-buttons {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    justify-content: center;
  }

  .pm-wrapper .btn-icon {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    transition: all 0.2s ease;
  }

  .pm-wrapper .btn-icon:hover {
    background: #f1f5f9;
    border-color: var(--border-hover);
  }

  .pm-wrapper .btn-icon.edit:hover {
    color: var(--accent-primary);
    border-color: var(--accent-primary);
    background: #eff6ff;
  }

  .pm-wrapper .btn-icon.delete:hover {
    color: var(--status-error);
    border-color: var(--status-error);
    background: #fef2f2;
  }

  /* Empty State */
  .pm-wrapper .empty-state {
    padding: 32px 20px;
    text-align: center;
    color: var(--text-muted);
  }

  .pm-wrapper .empty-state-icon {
    font-size: 40px;
    margin-bottom: 10px;
    opacity: 0.5;
  }

  .pm-wrapper .empty-state p {
    font-size: 13px;
    margin-bottom: 12px;
    color: var(--text-secondary);
  }

  /* Footer */
  .pm-wrapper .table-footer {
    padding: 10px 16px;
    border-top: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fafbfc;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .pm-wrapper .pagination-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pm-wrapper .btn-page {
    border: 1px solid var(--border-color);
    background: #ffffff;
    color: var(--text-primary);
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 500;
    transition: all 0.15s;
  }

  .pm-wrapper .btn-page:hover:not(:disabled) {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .pm-wrapper .btn-page:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .pm-wrapper .page-indicator {
    font-size: 11.5px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .pm-wrapper .spinner {
    width: 13px;
    height: 13px;
    border: 2px solid #cbd5e1;
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    display: inline-block;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .pm-wrapper {
      padding: var(--spacing-sm);
    }

    .pm-wrapper .header {
      flex-direction: column;
      align-items: stretch;
    }

    .pm-wrapper .header h1 {
      font-size: 20px;
    }

    .pm-wrapper .header-actions {
      flex-direction: column;
    }

    .pm-wrapper .search-box {
      max-width: 100%;
    }

    .pm-wrapper .btn-add {
      width: 100%;
      justify-content: center;
    }

    .pm-wrapper table {
      font-size: 12px;
    }

    .pm-wrapper thead th,
    .pm-wrapper tbody td {
      padding: 6px 8px;
    }

    .pm-wrapper .table-stats {
      flex-wrap: wrap;
      gap: 8px;
    }

    .pm-wrapper .table-footer {
      flex-direction: column;
      gap: 8px;
      text-align: center;
    }
  }
`;
