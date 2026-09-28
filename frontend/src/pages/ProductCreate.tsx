import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Autocomplete,
  IconButton,
  InputLabelProps,
  Dialog,
  FormControlLabel,
  Switch,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  InputAdornment,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import ListIcon from '@mui/icons-material/FormatListBulleted';
import InventoryIcon from '@mui/icons-material/Inventory';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useAppSelector } from '../store/hooks';
import { productApi } from '../services/api';

const labelShrink: InputLabelProps = { shrink: true };

interface Unit {
  _id: string;
  name?: string;
  shortCode: string;
}

interface Category {
  _id: string;
  name: string;
  code: string;
}

interface ProductOption {
  _id: string;
  name: string;
  code?: string;
  imei?: string;
}

interface MultiUnitRow {
  id: string;
  multiUnitId?: string; // System generated ID, stored in database but not displayed
  imei: string;
  conversion: string;
  unitId: string;
  wholesale: string;
  retail: string;
  specialPrice1: string;
  specialPrice2: string;
}

interface UsedProductDetail {
  _id: string;
  code: string;
  name: string;
  imei: string;
  retailPrice: number;
  hasTransactions: boolean;
}

export default function ProductCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [itemGroups, setItemGroups] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);

  // In-Use Product Details Dialog State
  const [inUseDialogOpen, setInUseDialogOpen] = useState(false);
  const [inUseEntityType, setInUseEntityType] = useState<'Category' | 'Item Group' | 'Brand' | 'Unit of Measure'>('Category');
  const [inUseEntityName, setInUseEntityName] = useState('');
  const [inUseActionType, setInUseActionType] = useState<'edit' | 'delete'>('edit');
  const [inUseProducts, setInUseProducts] = useState<UsedProductDetail[]>([]);
  const [inUseHasTransactions, setInUseHasTransactions] = useState(false);
  const [checkingUsage, setCheckingUsage] = useState(false);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = useState<'add' | 'edit'>('add');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryDialogName, setCategoryDialogName] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categoryDeleteDialogOpen, setCategoryDeleteDialogOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [unitDialogMode, setUnitDialogMode] = useState<'add' | 'edit'>('add');
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitDialogName, setUnitDialogName] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [unitDeleteDialogOpen, setUnitDeleteDialogOpen] = useState(false);
  const [deletingUnit, setDeletingUnit] = useState<Unit | null>(null);

  const [itemGroupDialogOpen, setItemGroupDialogOpen] = useState(false);
  const [itemGroupDialogMode, setItemGroupDialogMode] = useState<'add' | 'edit'>('add');
  const [oldItemGroupName, setOldItemGroupName] = useState('');
  const [itemGroupDialogName, setItemGroupDialogName] = useState('');
  const [itemGroupFilter, setItemGroupFilter] = useState('');
  const [itemGroupDeleteDialogOpen, setItemGroupDeleteDialogOpen] = useState(false);
  const [deletingItemGroup, setDeletingItemGroup] = useState('');

  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [brandDialogMode, setBrandDialogMode] = useState<'add' | 'edit'>('add');
  const [oldBrandName, setOldBrandName] = useState('');
  const [brandDialogName, setBrandDialogName] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [brandDeleteDialogOpen, setBrandDeleteDialogOpen] = useState(false);
  const [deletingBrand, setDeletingBrand] = useState('');
  const [brands, setBrands] = useState<string[]>([]);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [imei, setImei] = useState('');
  const [itemGroup, setItemGroup] = useState('');
  const [brand, setBrand] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [markupPercentage, setMarkupPercentage] = useState('');
  const [specialPrice, setSpecialPrice] = useState('');
  const [specialPrice2, setSpecialPrice2] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [allowBatches, setAllowBatches] = useState(true);
  const [disableBatchesConfirmOpen, setDisableBatchesConfirmOpen] = useState(false);
  const [enableBatchesConfirmOpen, setEnableBatchesConfirmOpen] = useState(false);
  const [multiUnits, setMultiUnits] = useState<MultiUnitRow[]>([]);
  const [pricesDialogRowId, setPricesDialogRowId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editModeActive, setEditModeActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successDialogMessage, setSuccessDialogMessage] = useState('');
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [editedDialogOpen, setEditedDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'pricing'>('general');

  // Change Product Name Dialog
  const [changeNameDialogOpen, setChangeNameDialogOpen] = useState(false);
  const [changeNameCode, setChangeNameCode] = useState('');
  const [changeNameValue, setChangeNameValue] = useState('');
  const [changeNameSaving, setChangeNameSaving] = useState(false);

  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const editBtnRef = useRef<HTMLButtonElement>(null);
  const productNameInputRef = useRef<HTMLInputElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const purchasePriceInputRef = useRef<HTMLInputElement>(null);

  // Focus Product Name on initial load or when company changes
  useEffect(() => {
    if (!companyId) return;
    const focusInput = () => {
      if (productNameInputRef.current) {
        productNameInputRef.current.focus();
      }
    };
    const t1 = setTimeout(focusInput, 80);
    const t2 = setTimeout(focusInput, 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [companyId]);

  // Query all visible, enabled interactive fields in form order
  const getNavigableFields = useCallback((): HTMLElement[] => {
    if (!formRef.current) return [];
    const elements = Array.from(
      formRef.current.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])'
      )
    );
    return elements.filter((el) => {
      return (
        el.offsetParent !== null &&
        window.getComputedStyle(el).display !== 'none' &&
        window.getComputedStyle(el).visibility !== 'hidden'
      );
    });
  }, []);

  const handleGoToPricing = () => {
    if (!name.trim()) {
      setErrorDialogMessage('Product name is required');
      setErrorDialogOpen(true);
      setTimeout(() => productNameInputRef.current?.focus(), 100);
      return;
    }
    if (!unitId) {
      setErrorDialogMessage('Unit of measure is required');
      setErrorDialogOpen(true);
      return;
    }
    setActiveTab('pricing');
    setTimeout(() => {
      purchasePriceInputRef.current?.focus();
      purchasePriceInputRef.current?.select?.();
    }, 100);
  };

  // Navigate to next field on Enter, or focus Save/Edit button if at the end
  const focusNextField = useCallback(
    (currentElement: HTMLElement) => {
      const fields = getNavigableFields();
      const currentIndex = fields.indexOf(currentElement);

      if (currentIndex >= 0 && currentIndex < fields.length - 1) {
        const nextField = fields[currentIndex + 1];
        nextField.focus();
        if (nextField instanceof HTMLInputElement || nextField instanceof HTMLTextAreaElement) {
          nextField.select?.();
        }
      } else {
        if (activeTab === 'general') {
          nextBtnRef.current?.focus();
        } else {
          if (editingId) {
            editBtnRef.current?.focus();
          } else {
            saveBtnRef.current?.focus();
          }
        }
      }
    },
    [getNavigableFields, editingId, activeTab]
  );

  // Navigate to previous field on Shift+Enter
  const focusPrevField = useCallback(
    (currentElement: HTMLElement) => {
      const fields = getNavigableFields();
      const currentIndex = fields.indexOf(currentElement);

      if (currentIndex > 0) {
        const prevField = fields[currentIndex - 1];
        prevField.focus();
        if (prevField instanceof HTMLInputElement || prevField instanceof HTMLTextAreaElement) {
          prevField.select?.();
        }
      }
    },
    [getNavigableFields]
  );

  // Form-wide Enter key handler: prevents unwanted form submission and navigates fields
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;

      if (target.tagName === 'BUTTON') {
        return;
      }

      if (target.closest('.MuiDialog-root') || target.closest('[role="dialog"]')) {
        return;
      }

      if (target.tagName === 'TEXTAREA' && e.shiftKey) {
        return;
      }

      e.preventDefault();

      if (e.shiftKey) {
        focusPrevField(target);
      } else {
        focusNextField(target);
      }
    }
  };

  const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
  const imagePreviewSrc = imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('data:')) ? imageUrl : (imageUrl ? (imageUrl.startsWith('/') ? imageUrl : `/${imageUrl.replace(/^\//, '')}`) : '');

  const loadNextCode = useCallback(() => {
    if (!companyId) return;
    productApi.getNextCode(companyId).then((res) => {
      const c = (res.data.data as { code: string })?.code;
      if (c) setCode(c);
    }).catch(() => setCode('prod1'));
  }, [companyId]);

  const refreshCategories = useCallback(() => {
    if (!companyId) return;
    productApi.getCategories(companyId).then((res) => setCategories((res.data.data as Category[]) ?? []));
  }, [companyId]);
  const refreshUnits = useCallback(() => {
    if (!companyId) return;
    productApi.getUnits(companyId).then((res) => setUnits((res.data.data as Unit[]) ?? []));
  }, [companyId]);
  const refreshItemGroups = useCallback(() => {
    if (!companyId) return;
    productApi.getItemGroups(companyId).then((res) => setItemGroups((res.data.data as string[]) ?? []));
  }, [companyId]);
  const refreshBrands = useCallback(() => {
    if (!companyId) return;
    productApi.getBrands(companyId).then((res) => setBrands((res.data.data as string[]) ?? [])).catch(() => setBrands([]));
  }, [companyId]);


  useEffect(() => {
    if (!companyId) return;
    refreshUnits();
    refreshCategories();
    refreshItemGroups();
    refreshBrands();
    loadNextCode();
  }, [companyId, loadNextCode, refreshUnits, refreshCategories, refreshItemGroups, refreshBrands]);

  useEffect(() => {
    if (!companyId) return;
    const search = productSearch.trim();
    if (!search) {
      setProductOptions([]);
      return;
    }
    const t = setTimeout(() => {
      productApi.list(companyId, { search, limit: 25 }).then((res) => {
        const d = res.data.data as { products: ProductOption[] };
        setProductOptions(d?.products ?? []);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [companyId, productSearch]);

  const loadProductIntoForm = useCallback((p: Record<string, unknown>) => {
    const id = p._id as string;
    const pName = (p.name as string) ?? '';
    setEditingId(id);
    setEditModeActive(false);
    setSelectedProduct({ _id: id, name: pName, code: p.code as string, imei: p.imei as string });
    setProductSearch(pName);
    setCode((p.code as string) ?? '');
    setName(pName);
    setImei((p.imei as string) ?? '');
    setItemGroup((p.itemGroup as string) ?? '');
    setBrand((p.brand as string) ?? '');
    setCategoryId((p.categoryId as { _id?: string })?._id ?? (p.categoryId as string) ?? '');
    setUnitId((p.unitOfMeasureId as { _id?: string })?._id ?? (p.unitOfMeasureId as string) ?? '');
    setRetailPrice(String(p.retailPrice ?? p.sellingPrice ?? ''));
    setWholesalePrice(String(p.wholesalePrice ?? p.mrp ?? ''));
    setPurchasePrice(String(p.purchasePrice ?? ''));
    const pCost = Number(p.purchasePrice ?? 0);
    const pRet = Number(p.retailPrice ?? p.sellingPrice ?? 0);
    if (pCost > 0 && pRet > 0) {
      const pct = ((pRet - pCost) / pCost) * 100;
      setMarkupPercentage(Number.isInteger(pct) ? pct.toString() : pct.toFixed(2));
    } else {
      setMarkupPercentage('');
    }
    setSpecialPrice(String(p.specialPrice ?? ''));
    setSpecialPrice2(String(p.specialPrice2 ?? ''));
    setImageUrl((p.imageUrl as string) ?? '');
    setAllowBatches((p as any).allowBatches !== false);
    const mus = (p.multiUnits as Array<{ multiUnitId?: string; imei?: string; conversion?: number; price?: number; unitId?: { _id: string } | string; wholesale?: number; retail?: number; specialPrice1?: number; specialPrice2?: number }>) ?? [];
    setMultiUnits(mus.map((u, i) => {
      return {
        id: `mu-${i}-${Date.now()}`,
        multiUnitId: u.multiUnitId, // Preserve system-generated ID from database
        imei: String(u.imei ?? ''),
        conversion: String(u.conversion ?? ''),
        unitId: typeof u.unitId === 'object' ? (u.unitId?._id ?? '') : (u.unitId ?? ''),
        wholesale: String(u.wholesale ?? ''),
        retail: String(u.retail ?? ''),
        specialPrice1: String(u.specialPrice1 ?? ''),
        specialPrice2: String(u.specialPrice2 ?? ''),
      };
    }));
  }, []);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!companyId || !editId) return;
    productApi.get(editId, companyId).then((res) => {
      const data = res.data?.data as Record<string, unknown>;
      if (data) {
        loadProductIntoForm(data);
      }
    }).catch((err) => {
      console.error('Failed to load product for editing', err);
    });
  }, [companyId, searchParams, loadProductIntoForm]);


  const searchByImei = useCallback((imeiValue: string, silentIfNotFound = false) => {
    if (!companyId || !imeiValue.trim()) return;
    productApi.getByImei(companyId, imeiValue.trim()).then((res) => {
      const responseData = res.data.data as { product?: Record<string, unknown> } | null;
      if (responseData?.product) {
        loadProductIntoForm(responseData.product);
        setSuccessDialogMessage('Product loaded');
        setSuccessDialogOpen(true);
      } else if (!silentIfNotFound) {
        setErrorDialogMessage('Product not found for this IMEI');
        setErrorDialogOpen(true);
      }
    }).catch(() => {
      if (!silentIfNotFound) {
        setErrorDialogMessage('Product not found for this IMEI');
        setErrorDialogOpen(true);
      }
    });
  }, [companyId, loadProductIntoForm]);

  const handleImeiKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      focusNextField(e.currentTarget);
    }
  };

  const handleImeiBlur = () => {
    // Only search if there's an IMEI value and no product is currently selected
    if (!selectedProduct && imei.trim()) {
      searchByImei(imei, true);
    }
  };

  const handleProductSelect = (_: unknown, value: ProductOption | null) => {
    setSelectedProduct(value);
    if (!value) {
      setEditingId(null);
      setName(productSearch);
      return;
    }
    productApi.get(value._id, companyId!).then((res) => {
      loadProductIntoForm(res.data.data as Record<string, unknown>);
    });
  };

  // Usage Check Helper to prevent editing or deleting in-use fields
  const checkUsageAndProceed = async (
    type: 'category' | 'unit' | 'itemGroup' | 'brand',
    entityLabel: 'Category' | 'Item Group' | 'Brand' | 'Unit of Measure',
    identifier: string,
    displayName: string,
    action: 'edit' | 'delete',
    onAllowed: () => void
  ) => {
    if (!companyId) {
      onAllowed();
      return;
    }
    setCheckingUsage(true);
    try {
      const res = await productApi.checkFieldUsage(companyId, type, identifier);
      const data = res.data.data;
      if (data && data.inUse) {
        setInUseEntityType(entityLabel);
        setInUseEntityName(displayName);
        setInUseActionType(action);
        setInUseProducts((data.products as UsedProductDetail[]) || []);
        setInUseHasTransactions(Boolean(data.hasTransactions));
        setInUseDialogOpen(true);
        return;
      }
      onAllowed();
    } catch (err: unknown) {
      console.error('Failed to check field usage', err);
      onAllowed();
    } finally {
      setCheckingUsage(false);
    }
  };

  // Category handlers
  const handleOpenCategoryDialog = () => {
    setCategoryDialogMode('add');
    setEditingCategoryId(null);
    setCategoryDialogName('');
    setCategoryFilter('');
    setCategoryDialogOpen(true);
  };
  const handleStartEditCategory = (cat: Category) => {
    setCategoryDialogMode('edit');
    setEditingCategoryId(cat._id);
    setCategoryDialogName(cat.name);
  };
  const handleCancelEditCategory = () => {
    setCategoryDialogMode('add');
    setEditingCategoryId(null);
    setCategoryDialogName('');
  };
  const handleOpenDeleteCategory = (cat: Category) => {
    setDeletingCategory(cat);
    setCategoryDeleteDialogOpen(true);
  };
  const handleSaveCategory = async () => {
    const catName = categoryDialogName.trim();
    if (!companyId || !catName) return;
    setSavingCategory(true);
    try {
      if (categoryDialogMode === 'add') {
        const res = await productApi.createCategory(companyId, {
          name: catName,
        });
        const newCat = res.data.data as Category;
        refreshCategories();
        if (newCat?._id) setCategoryId(newCat._id);
      } else if (editingCategoryId) {
        const res = await productApi.updateCategory(editingCategoryId, companyId, {
          name: catName,
        });
        const updatedCat = res.data.data as Category;
        refreshCategories();
        if (updatedCat?._id) setCategoryId(updatedCat._id);
      }
      handleCancelEditCategory();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save category';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    } finally {
      setSavingCategory(false);
    }
  };
  const handleConfirmDeleteCategory = async () => {
    if (!companyId || !deletingCategory) return;
    try {
      await productApi.deleteCategory(deletingCategory._id, companyId);
      if (categoryId === deletingCategory._id) {
        setCategoryId('');
      }
      if (editingCategoryId === deletingCategory._id) {
        handleCancelEditCategory();
      }
      refreshCategories();
      setCategoryDeleteDialogOpen(false);
      setDeletingCategory(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to delete category';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    }
  };

  // Unit handlers
  const handleOpenUnitDialog = () => {
    setUnitDialogMode('add');
    setEditingUnitId(null);
    setUnitDialogName('');
    setUnitFilter('');
    setUnitDialogOpen(true);
  };
  const handleStartEditUnit = (u: Unit) => {
    setUnitDialogMode('edit');
    setEditingUnitId(u._id);
    setUnitDialogName(u.name || u.shortCode || '');
  };
  const handleCancelEditUnit = () => {
    setUnitDialogMode('add');
    setEditingUnitId(null);
    setUnitDialogName('');
  };
  const handleOpenDeleteUnit = (u: Unit) => {
    setDeletingUnit(u);
    setUnitDeleteDialogOpen(true);
  };
  const handleSaveUnit = async () => {
    const finalName = unitDialogName.trim();
    if (!companyId || !finalName) return;
    setSavingUnit(true);
    try {
      if (unitDialogMode === 'add') {
        const res = await productApi.createUnit(companyId, {
          name: finalName,
        });
        const newUnit = res.data.data as Unit;
        refreshUnits();
        if (newUnit?._id) setUnitId(newUnit._id);
      } else if (editingUnitId) {
        const res = await productApi.updateUnit(editingUnitId, {
          name: finalName,
        });
        const updated = res.data.data as Unit;
        refreshUnits();
        if (updated?._id) setUnitId(updated._id);
      }
      handleCancelEditUnit();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save unit';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    } finally {
      setSavingUnit(false);
    }
  };
  const handleConfirmDeleteUnit = async () => {
    if (!deletingUnit) return;
    try {
      await productApi.deleteUnit(deletingUnit._id);
      if (unitId === deletingUnit._id) {
        setUnitId('');
      }
      if (editingUnitId === deletingUnit._id) {
        handleCancelEditUnit();
      }
      refreshUnits();
      setUnitDeleteDialogOpen(false);
      setDeletingUnit(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to delete unit';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    }
  };

  // Item Group handlers
  const handleOpenItemGroupDialog = () => {
    setItemGroupDialogMode('add');
    setOldItemGroupName('');
    setItemGroupDialogName('');
    setItemGroupFilter('');
    setItemGroupDialogOpen(true);
  };
  const handleStartEditItemGroup = (name: string) => {
    setItemGroupDialogMode('edit');
    setOldItemGroupName(name);
    setItemGroupDialogName(name);
  };
  const handleCancelEditItemGroup = () => {
    setItemGroupDialogMode('add');
    setOldItemGroupName('');
    setItemGroupDialogName('');
  };
  const handleOpenDeleteItemGroup = (name: string) => {
    setDeletingItemGroup(name);
    setItemGroupDeleteDialogOpen(true);
  };
  const handleSaveItemGroup = async () => {
    const name = itemGroupDialogName.trim();
    if (!name) return;
    try {
      if (itemGroupDialogMode === 'add') {
        setItemGroup(name);
        setItemGroups((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
      } else if (oldItemGroupName) {
        if (companyId) {
          await productApi.updateItemGroup(companyId, oldItemGroupName, name);
          refreshItemGroups();
        }
        setItemGroups((prev) => prev.map((g) => (g === oldItemGroupName ? name : g)).sort());
        if (itemGroup === oldItemGroupName) setItemGroup(name);
      }
      handleCancelEditItemGroup();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save item group';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    }
  };
  const handleConfirmDeleteItemGroup = async () => {
    if (!deletingItemGroup) return;
    try {
      if (companyId) {
        await productApi.deleteItemGroup(companyId, deletingItemGroup);
        refreshItemGroups();
      }
      setItemGroups((prev) => prev.filter((g) => g !== deletingItemGroup));
      if (itemGroup === deletingItemGroup) setItemGroup('');
      if (oldItemGroupName === deletingItemGroup) handleCancelEditItemGroup();
      setItemGroupDeleteDialogOpen(false);
      setDeletingItemGroup('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to delete item group';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    }
  };

  // Brand handlers
  const handleOpenBrandDialog = () => {
    setBrandDialogMode('add');
    setOldBrandName('');
    setBrandDialogName('');
    setBrandFilter('');
    setBrandDialogOpen(true);
  };
  const handleStartEditBrand = (name: string) => {
    setBrandDialogMode('edit');
    setOldBrandName(name);
    setBrandDialogName(name);
  };
  const handleCancelEditBrand = () => {
    setBrandDialogMode('add');
    setOldBrandName('');
    setBrandDialogName('');
  };
  const handleOpenDeleteBrand = (name: string) => {
    setDeletingBrand(name);
    setBrandDeleteDialogOpen(true);
  };
  const handleSaveBrand = async () => {
    const name = brandDialogName.trim();
    if (!name) return;
    try {
      if (brandDialogMode === 'add') {
        setBrand(name);
        setBrands((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
      } else if (oldBrandName) {
        if (companyId) {
          await productApi.updateBrand(companyId, oldBrandName, name);
          refreshBrands();
        }
        setBrands((prev) => prev.map((b) => (b === oldBrandName ? name : b)).sort());
        if (brand === oldBrandName) setBrand(name);
      }
      handleCancelEditBrand();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save brand';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    }
  };
  const handleConfirmDeleteBrand = async () => {
    if (!deletingBrand) return;
    try {
      if (companyId) {
        await productApi.deleteBrand(companyId, deletingBrand);
        refreshBrands();
      }
      setBrands((prev) => prev.filter((b) => b !== deletingBrand));
      if (brand === deletingBrand) setBrand('');
      if (oldBrandName === deletingBrand) handleCancelEditBrand();
      setBrandDeleteDialogOpen(false);
      setDeletingBrand('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to delete brand';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    }
  };

  const addMultiUnitRow = () => {
    setMultiUnits((prev) => [...prev, { id: `mu-${Date.now()}`, imei: '', conversion: '1', unitId: unitId || (units[0]?._id ?? ''), wholesale: '', retail: '', specialPrice1: '', specialPrice2: '' }]);
  };

  const removeMultiUnitRow = (id: string) => {
    setMultiUnits((prev) => prev.filter((r) => r.id !== id));
  };

  const updateMultiUnit = (id: string, field: keyof MultiUnitRow, value: string) => {
    setMultiUnits((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      return { ...r, [field]: value };
    }));
  };

  const handleClear = () => {
    setEditingId(null);
    setEditModeActive(false);
    setSelectedProduct(null);
    setProductSearch('');
    setCode('');
    setName('');
    setImei('');
    setItemGroup('');
    setBrand('');
    setCategoryId('');
    setUnitId('');
    setRetailPrice('');
    setWholesalePrice('');
    setPurchasePrice('');
    setMarkupPercentage('');
    setSpecialPrice('');
    setSpecialPrice2('');
    setImageUrl('');
    setAllowBatches(true);
    setMultiUnits([]);
    setActiveTab('general');
    loadNextCode();
    setTimeout(() => {
      productNameInputRef.current?.focus();
    }, 80);
  };

  const getUpdatePayload = () => ({
    companyId,
    code: code.trim() || undefined,
    name: name.trim(),
    imei: imei.trim() || undefined,
    itemGroup: itemGroup.trim() || undefined,
    brand: brand.trim() || undefined,
    categoryId: categoryId || undefined,
    unitOfMeasureId: unitId,
    retailPrice: retailPrice ? Number(retailPrice) : 0,
    wholesalePrice: wholesalePrice ? Number(wholesalePrice) : 0,
    purchasePrice: purchasePrice ? Number(purchasePrice) : 0,
    specialPrice: specialPrice ? Number(specialPrice) : undefined,
    specialPrice2: specialPrice2 ? Number(specialPrice2) : undefined,
    imageUrl: imageUrl.trim() || undefined,
    allowBatches,
    multiUnits: allowBatches ? [] : multiUnits
      .filter((r) => r.imei.trim() || r.conversion.trim())
      .map((r) => ({
        multiUnitId: r.multiUnitId, // Preserve existing multiUnitId or let backend generate new one
        imei: r.imei.trim(),
        conversion: Number(r.conversion) || 1,
        price: 0,
        totalPrice: 0,
        unitId: r.unitId,
        wholesale: Number(r.wholesale) || 0,
        retail: Number(r.retail) || 0,
        specialPrice1: Number(r.specialPrice1) || 0,
        specialPrice2: Number(r.specialPrice2) || 0,
      })),
  });

  const performSave = async () => {
    if (!companyId) return;
    if (!name.trim()) {
      setActiveTab('general');
      setErrorDialogMessage('Product name is required');
      setErrorDialogOpen(true);
      setTimeout(() => productNameInputRef.current?.focus(), 100);
      return;
    }
    if (!unitId) {
      setActiveTab('general');
      setErrorDialogMessage('Unit is required');
      setErrorDialogOpen(true);
      return;
    }
    setSaving(true);
    try {
      const payload = getUpdatePayload();
      if (editingId) {
        await productApi.update(editingId, companyId, payload);
        setSuccessDialogMessage('Saved');
        setSuccessDialogOpen(true);
      } else {
        await productApi.create(payload);
        handleClear();
        setSuccessDialogMessage('Saved');
        setSuccessDialogOpen(true);
      }
      refreshItemGroups();
      setSaveConfirmOpen(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Save failed';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    } finally {
      setSaving(false);
    }
  };

  // Auto-fill all price columns when percentage is entered
  const applyPercentageToPrices = (pctStr: string, basePurchaseStr: string) => {
    const pct = parseFloat(pctStr);
    const pCost = parseFloat(basePurchaseStr);
    if (isNaN(pct) || isNaN(pCost) || pCost < 0) return;

    const calculatedPrice = pCost + (pCost * pct) / 100;
    const formattedPrice = calculatedPrice.toFixed(2);

    setRetailPrice(formattedPrice);
    setWholesalePrice(formattedPrice);
    setSpecialPrice(formattedPrice);
    setSpecialPrice2(formattedPrice);

    setMultiUnits((prev) =>
      prev.map((row) => {
        const conv = parseFloat(row.conversion) || 1;
        const rowPrice = (calculatedPrice * conv).toFixed(2);
        return {
          ...row,
          retail: rowPrice,
          wholesale: rowPrice,
          specialPrice1: rowPrice,
          specialPrice2: rowPrice,
        };
      })
    );
  };

  const handlePercentageChange = (val: string) => {
    setMarkupPercentage(val);
    if (val.trim() === '') return;
    applyPercentageToPrices(val, purchasePrice);
  };

  const handlePurchasePriceChange = (val: string) => {
    setPurchasePrice(val);
    if (markupPercentage && markupPercentage.trim() !== '') {
      applyPercentageToPrices(markupPercentage, val);
    }
  };

  const handleSave = () => {
    if (editingId && !editModeActive) return;
    if (!name.trim()) {
      setActiveTab('general');
      setErrorDialogMessage('Product name is required');
      setErrorDialogOpen(true);
      setTimeout(() => productNameInputRef.current?.focus(), 100);
      return;
    }
    if (!unitId) {
      setActiveTab('general');
      setErrorDialogMessage('Unit is required');
      setErrorDialogOpen(true);
      return;
    }
    setSaveConfirmOpen(true);
  };

  const handleEditClick = () => {
    if (!editingId) return;
    setEditConfirmOpen(true);
  };
  const handleEditConfirm = async () => {
    if (!editingId || !companyId) return;
    if (!name.trim()) {
      setActiveTab('general');
      setErrorDialogMessage('Product name is required');
      setErrorDialogOpen(true);
      setTimeout(() => productNameInputRef.current?.focus(), 100);
      return;
    }
    if (!unitId) {
      setActiveTab('general');
      setErrorDialogMessage('Unit is required');
      setErrorDialogOpen(true);
      return;
    }
    setEditConfirmOpen(false);
    setSaving(true);
    try {
      const payload = getUpdatePayload();
      await productApi.update(editingId, companyId, payload);
      refreshItemGroups();
      handleClear();
      setEditedDialogOpen(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Update failed';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const handleImageBrowse = () => fileInputRef.current?.click();
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!companyId) {
      setImageError('Select a company first');
      return;
    }
    setImageError(null);
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError('Image size must be 20MB or less');
      return;
    }
    if (!/^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.type)) {
      setImageError('Only image files (JPEG, PNG, GIF, WebP) are allowed');
      return;
    }
    setImageUploading(true);
    productApi.uploadImage(companyId, file)
      .then((res) => {
        const url = (res.data.data as { url: string })?.url;
        if (url) setImageUrl(url);
      })
      .catch((err: { response?: { data?: { message?: string } } }) => {
        setImageError(err?.response?.data?.message ?? 'Upload failed');
      })
      .finally(() => setImageUploading(false));
  };

  const handleDeleteClick = () => {
    if (!editingId) return;
    setDeleteConfirmOpen(true);
  };
  const handleDeleteConfirm = async () => {
    if (!companyId || !editingId) return;
    setDeleteConfirmOpen(false);
    try {
      await productApi.delete(editingId, companyId);
      setSuccessDialogMessage('Deleted');
      setSuccessDialogOpen(true);
      handleClear();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Delete failed';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    }
  };

  // Change Product Name handlers
  const handleOpenChangeName = () => {
    if (!selectedProduct) return;
    setChangeNameCode(selectedProduct.code || '');
    setChangeNameValue(selectedProduct.name || '');
    setChangeNameDialogOpen(true);
  };

  const handleChangeNameSave = async () => {
    if (!companyId || !editingId || !changeNameValue.trim()) return;
    setChangeNameSaving(true);
    try {
      await productApi.update(editingId, companyId, {
        name: changeNameValue.trim(),
      });
      // Update the local state
      setProductOptions((prev) =>
        prev.map((o) => (o._id === editingId ? { ...o, name: changeNameValue.trim() } : o))
      );
      setSelectedProduct((prev) => prev ? { ...prev, name: changeNameValue.trim() } : null);
      setProductSearch(changeNameValue.trim());
      setName(changeNameValue.trim());
      setChangeNameDialogOpen(false);
      setSuccessDialogMessage('Product name updated');
      setSuccessDialogOpen(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to update name';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    } finally {
      setChangeNameSaving(false);
    }
  };


  if (!companyId) return <Typography color="error">Select a company first.</Typography>;

  return (
    <Box
      sx={{
        py: { xs: 1, sm: 2 },
        px: { xs: 1, sm: 2 },
        bgcolor: '#f8f9fb',
        minHeight: '100%',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <style>{`
        .prod-reg-container {
          max-width: 980px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
          overflow: hidden;
          border: 1px solid #e2e8f0;
        }
        .prod-reg-header {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          padding: 14px 20px;
          color: white;
        }
        .prod-reg-header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }
        .prod-reg-header h1 {
          font-size: 16px;
          font-weight: 600;
          letter-spacing: -0.3px;
          margin: 0;
          line-height: 1.2;
          color: #ffffff;
        }
        .prod-reg-header-meta {
          font-size: 10px;
          opacity: 0.85;
          color: #94a3b8;
          margin-top: 2px;
        }
        .prod-reg-header-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 9px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.2);
          font-size: 10.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
          white-space: nowrap;
        }
        .prod-reg-header-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #ffffff;
        }
        .prod-reg-content {
          padding: 22px;
        }
        .prod-reg-form-section {
          margin-bottom: 18px;
        }
        .prod-reg-tabs-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f1f5f9;
          padding: 5px;
          border-radius: 8px;
          margin-bottom: 20px;
          border: 1px solid #e2e8f0;
        }
        .prod-reg-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: #64748b;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }
        .prod-reg-tab-btn:hover:not(.active) {
          color: #1e293b;
          background: rgba(255, 255, 255, 0.7);
        }
        .prod-reg-tab-btn.active {
          background: #ffffff;
          color: #1d4ed8;
          border-color: #cbd5e1;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
        }
        .prod-reg-tab-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 700;
          border-radius: 12px;
          background: #dbeafe;
          color: #1d4ed8;
        }
        .prod-reg-pricing-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-left: 4px solid #3b82f6;
          border-radius: 6px;
          padding: 10px 14px;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .prod-reg-pricing-summary-item {
          display: flex;
          flex-direction: column;
        }
        .prod-reg-pricing-summary-label {
          font-size: 10.5px;
          color: #64748b;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .prod-reg-pricing-summary-val {
          font-size: 13.5px;
          font-weight: 700;
          color: #0f172a;
        }
        .prod-reg-margin-card {
          margin-top: 16px;
          padding: 12px 16px;
          border-radius: 6px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          display: flex;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
        }
        .prod-reg-margin-item {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .prod-reg-margin-label {
          font-size: 12px;
          font-weight: 600;
          color: #166534;
        }
        .prod-reg-margin-value {
          font-size: 14px;
          font-weight: 700;
          color: #15803d;
        }
        .prod-reg-section-header {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: #1a2332;
          margin-bottom: 12px;
          padding-bottom: 5px;
          border-bottom: 1.5px solid #3b82f6;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .prod-reg-form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
          margin-bottom: 11px;
        }
        .prod-reg-form-grid.triple {
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        }
        .prod-reg-form-grid.pricing-row {
          display: grid;
          grid-template-columns: minmax(130px, 1.2fr) 95px minmax(130px, 1.2fr) minmax(130px, 1.2fr);
          align-items: start;
        }
        @media (max-width: 640px) {
          .prod-reg-form-grid.pricing-row {
            grid-template-columns: 1fr 1fr;
          }
        }
        .prod-reg-form-group {
          display: flex;
          flex-direction: column;
        }
        .prod-reg-form-label {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 5px;
          display: flex;
          align-items: center;
          gap: 3px;
        }
        .prod-reg-required {
          color: #ef4444;
          font-weight: 700;
        }
        .prod-reg-hint {
          font-size: 10.5px;
          color: #94a3b8;
          margin-top: 3px;
          line-height: 1.3;
        }
        .prod-reg-hint.locked {
          color: #f59e0b;
        }
        .prod-reg-input,
        .prod-reg-select {
          padding: 6px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 13.5px;
          font-weight: 700;
          font-family: inherit;
          transition: all 0.2s ease;
          background: white;
          color: #0f172a;
          width: 100%;
          box-sizing: border-box;
          height: 34px;
        }
        .prod-reg-input:hover,
        .prod-reg-select:hover {
          border-color: #94a3b8;
        }
        .prod-reg-input:focus,
        .prod-reg-select:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
        }
        .prod-reg-input:disabled,
        .prod-reg-select:disabled {
          background: #f1f5f9;
          color: #64748b;
          border-color: #e2e8f0;
          cursor: not-allowed;
          font-weight: 700;
        }
        .prod-reg-input::placeholder,
        .prod-reg-container .MuiOutlinedInput-input::placeholder {
          font-weight: 500;
          color: #94a3b8;
        }
        .prod-reg-code-field {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 10px;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-weight: 700;
          color: #0f172a;
          font-family: 'Courier New', monospace;
          font-size: 13.5px;
          letter-spacing: 0.5px;
          height: 34px;
          box-sizing: border-box;
        }
        .prod-reg-code-label {
          font-size: 11px;
          color: #64748b;
          font-weight: 700;
          font-family: inherit;
        }
        .prod-reg-add-btn {
          padding: 4px 8px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #2563eb;
          border-radius: 4px;
          font-size: 10.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }
        .prod-reg-add-btn:hover {
          background: #dbeafe;
          border-color: #93c5fd;
        }
        .prod-reg-edit-btn {
          padding: 4px 7px;
          background: #fefce8;
          border: 1px solid #fef08a;
          color: #b45309;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }
        .prod-reg-edit-btn:hover {
          background: #fef9c3;
          border-color: #fde047;
          color: #92400e;
        }
        .prod-reg-del-btn {
          padding: 4px 7px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }
        .prod-reg-del-btn:hover {
          background: #fee2e2;
          border-color: #f87171;
          color: #b91c1c;
        }
        .prod-reg-container .MuiOutlinedInput-root {
          border-radius: 6px;
          background-color: #ffffff;
          min-height: 34px !important;
          height: 34px !important;
          font-size: 13.5px !important;
          font-weight: 700 !important;
          padding: 0 8px !important;
        }
        .prod-reg-container .MuiOutlinedInput-root fieldset {
          border-color: #cbd5e1;
        }
        .prod-reg-container .MuiOutlinedInput-root:hover fieldset {
          border-color: #94a3b8;
        }
        .prod-reg-container .MuiOutlinedInput-root.Mui-focused fieldset {
          border-color: #3b82f6;
          border-width: 2px;
        }
        .prod-reg-container .MuiOutlinedInput-input {
          padding: 5px 8px !important;
          font-size: 13.5px !important;
          font-weight: 700 !important;
          color: #0f172a !important;
          height: auto !important;
        }
        .prod-reg-container .MuiAutocomplete-endAdornment {
          top: calc(50% - 10px) !important;
        }
        .prod-reg-container .MuiAutocomplete-endAdornment .MuiIconButton-root {
          padding: 1px !important;
        }
        .prod-reg-container .MuiAutocomplete-endAdornment .MuiSvgIcon-root {
          font-size: 14px !important;
        }
        .MuiDialog-root input,
        .MuiDialog-root select,
        .MuiDialog-root textarea,
        .MuiDialog-root .MuiInputBase-input {
          font-size: 13.5px !important;
          font-weight: 700 !important;
          color: #0f172a !important;
        }
        .MuiDialog-root .MuiInputLabel-root {
          font-size: 13px !important;
          font-weight: 700 !important;
        }
        .prod-reg-actions {
          display: flex;
          gap: 10px;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
          margin-top: 18px;
          flex-wrap: wrap;
        }
        .prod-reg-btn {
          padding: 8px 18px;
          border: none;
          border-radius: 6px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          white-space: nowrap;
        }
        .prod-reg-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .prod-reg-btn:focus-visible,
        .prod-reg-btn:focus {
          outline: 2px solid #2563eb !important;
          outline-offset: 1px !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.3) !important;
        }
        .prod-reg-btn-primary {
          background: linear-gradient(135deg, #3b82f6 0%, #0284c7 100%);
          color: white;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .prod-reg-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
        }
        .prod-reg-btn-secondary {
          background: #0d9488;
          color: white;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .prod-reg-btn-secondary:hover:not(:disabled) {
          background: #0f766e;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(13, 148, 136, 0.3);
        }
        .prod-reg-btn-clear {
          background: #ef4444;
          color: white;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .prod-reg-btn-clear:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(239, 68, 68, 0.3);
        }
        .prod-reg-btn-tertiary {
          background: white;
          color: #64748b;
          border: 1px solid #e2e8f0;
        }
        .prod-reg-btn-tertiary:hover:not(:disabled) {
          background: #f8f9fb;
          color: #1a2332;
          border-color: #cbd5e1;
        }
        .prod-reg-btn-danger {
          background: #fee2e2;
          color: #991b1b;
        }
        .prod-reg-btn-danger:hover:not(:disabled) {
          background: #fecaca;
        }
        .prod-reg-divider {
          height: 1px;
          background: #e2e8f0;
          margin: 16px 0;
        }
        @media (max-width: 768px) {
          .prod-reg-content { padding: 14px; }
          .prod-reg-header { padding: 11px 14px; }
          .prod-reg-actions button { width: 100%; justify-content: center; }
        }
      `}</style>

      <div className="prod-reg-container">
        {/* Header */}
        <div className="prod-reg-header">
          <div className="prod-reg-header-content">
            <div>
              <h1>Product Registration</h1>
              <div className="prod-reg-header-meta">
                {editingId ? `Editing: ${name || code}` : 'Create and manage item catalog, rates, and stock settings'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="prod-reg-header-btn"
                onClick={() => navigate('/master/products/management')}
                title="View Product Management"
              >
                <ListIcon sx={{ fontSize: 13 }} />
                <span>Product Management</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="prod-reg-content">
          <form ref={formRef} noValidate onSubmit={(e) => { e.preventDefault(); }} onKeyDown={handleFormKeyDown}>

            {/* Tab Navigation */}
            <div className="prod-reg-tabs-bar">
              <button
                type="button"
                className={`prod-reg-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
                onClick={() => setActiveTab('general')}
              >
                <InventoryIcon sx={{ fontSize: 16 }} />
                <span>General Details</span>
              </button>
              <button
                type="button"
                className={`prod-reg-tab-btn ${activeTab === 'pricing' ? 'active' : ''}`}
                onClick={() => setActiveTab('pricing')}
              >
                <LocalOfferIcon sx={{ fontSize: 16 }} />
                <span>Pricing & Rates</span>
                {Boolean(retailPrice || purchasePrice) && (
                  <span className="prod-reg-tab-badge">
                    {retailPrice ? `${Number(retailPrice).toFixed(2)} AED` : 'Configured'}
                  </span>
                )}
              </button>
            </div>

            {/* Tab 1: General Details */}
            <div style={{ display: activeTab === 'general' ? 'block' : 'none' }}>
              {/* Section 1: Product Identification */}
              <div className="prod-reg-form-section">
              <div className="prod-reg-section-header">Product Identification</div>

              <div className="prod-reg-form-grid">
                {/* Product Code */}
                <div className="prod-reg-form-group">
                  <label className="prod-reg-form-label">Product Code</label>
                  <div className="prod-reg-code-field">
                    <span className="prod-reg-code-label">Code:</span>
                    <span>{code || 'Auto-generated'}</span>
                  </div>
                  <div className="prod-reg-hint">Auto-generated item code</div>
                </div>

                {/* Product Name */}
                <div className="prod-reg-form-group" style={{ gridColumn: 'span 2' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="prod-reg-form-label" style={{ margin: 0 }}>
                      Product Name <span className="prod-reg-required">*</span>
                    </label>
                    {selectedProduct && (
                      <button
                        type="button"
                        onClick={handleOpenChangeName}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#3b82f6',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                        }}
                      >
                        Change Name
                      </button>
                    )}
                  </div>
                  <Autocomplete
                    freeSolo
                    disabled={!!selectedProduct}
                    options={selectedProduct && !productOptions.some((o) => o._id === selectedProduct._id) ? [selectedProduct, ...productOptions] : productOptions}
                    getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt?.name) ?? ''}
                    value={selectedProduct != null ? selectedProduct : (productSearch.trim() ? productSearch : null)}
                    onChange={(_, newVal) => {
                      if (newVal == null) {
                        setSelectedProduct(null);
                        setProductSearch('');
                        setName('');
                        setEditingId(null);
                        return;
                      }
                      if (typeof newVal === 'string') {
                        setSelectedProduct(null);
                        setProductSearch(newVal);
                        setName(newVal);
                        setEditingId(null);
                        return;
                      }
                      handleProductSelect(_, newVal);
                    }}
                    onInputChange={(_, v) => {
                      setProductSearch(v ?? '');
                      if (v?.trim()) setName(v.trim());
                      else if (selectedProduct == null) setName('');
                    }}
                    inputValue={productSearch}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder="Enter product name or search existing"
                        inputRef={productNameInputRef}
                        inputProps={{
                          ...params.inputProps,
                          onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                            params.inputProps?.onKeyDown?.(e);
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              setTimeout(() => {
                                if (productNameInputRef.current) {
                                  focusNextField(productNameInputRef.current);
                                }
                              }, 50);
                            }
                          },
                        }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '6px',
                            backgroundColor: '#ffffff',
                            '& fieldset': { borderColor: '#cbd5e1' },
                            '&:hover fieldset': { borderColor: '#94a3b8' },
                            '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                          },
                        }}
                      />
                    )}
                    renderOption={(props, option) => (
                      <li {...props} key={option._id} style={{ padding: '6px 10px', minHeight: 32 }}>
                        <Box>
                          <Typography variant="body1" sx={{ fontSize: '0.88rem', fontWeight: 700 }}>{option.name}</Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.78rem', color: 'text.secondary', fontWeight: 600 }}>
                            {option.code ?? ''} {option.imei ? ` • IMEI: ${option.imei}` : ''}
                          </Typography>
                        </Box>
                      </li>
                    )}
                    slotProps={{
                      paper: { sx: { '& .MuiAutocomplete-listbox': { maxHeight: 260 } } },
                    }}
                  />
                  <div className="prod-reg-hint">Search existing product to edit or type new product name</div>
                </div>
              </div>

              <div className="prod-reg-form-grid">
                {/* IMEI / Barcode */}
                <div className="prod-reg-form-group">
                  <label className="prod-reg-form-label">IMEI / Barcode</label>
                  <input
                    type="text"
                    className="prod-reg-input"
                    placeholder="Enter or scan barcode"
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    onKeyDown={handleImeiKeyDown}
                    onBlur={handleImeiBlur}
                  />
                  <div className="prod-reg-hint">Enter or scan product barcode</div>
                </div>

                {/* Product Image */}
                <div className="prod-reg-form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="prod-reg-form-label">Product Image</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleImageChange}
                      style={{ display: 'none' }}
                    />
                    <div
                      onClick={handleImageBrowse}
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 6,
                        border: '2px dashed #cbd5e1',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#f8fafc',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {imagePreviewSrc ? (
                        <img src={imagePreviewSrc} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: 16, color: '#94a3b8' }}>📷</span>
                      )}
                    </div>
                    <div>
                      <button
                        type="button"
                        className="prod-reg-add-btn"
                        onClick={handleImageBrowse}
                        disabled={!companyId || imageUploading}
                        style={{ padding: '4px 8px', fontSize: '9.5px', borderRadius: 4 }}
                      >
                        {imageUploading ? 'Uploading…' : imagePreviewSrc ? 'Change Photo' : 'Select Photo'}
                      </button>
                      <div className="prod-reg-hint">JPG, PNG, WebP up to 20MB</div>
                      {imageError && <div style={{ color: '#ef4444', fontSize: '9.5px', marginTop: 3 }}>{imageError}</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="prod-reg-divider" />

            {/* Section 2: Classification & Hierarchy */}
            <div className="prod-reg-form-section">
              <div className="prod-reg-section-header">Classification & Hierarchy</div>

              <div className="prod-reg-form-grid triple">
                {/* Category */}
                <div className="prod-reg-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="prod-reg-form-label" style={{ margin: 0 }}>Category</label>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="prod-reg-add-btn"
                        onClick={handleOpenCategoryDialog}
                        title="Manage Categories"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                  <Autocomplete
                    size="small"
                    options={categories}
                    getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt ? opt.name : '')}
                    isOptionEqualToValue={(opt, val) => (opt as Category)?._id === (val as Category)?._id}
                    value={categories.find((c) => c._id === categoryId) || null}
                    onChange={(_, val) => {
                      const selected = val as Category | null;
                      setCategoryId(selected?._id || '');
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder="Choose or select category"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '6px',
                            backgroundColor: '#ffffff',
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&:hover fieldset': { borderColor: '#cbd5e1' },
                            '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                          },
                        }}
                      />
                    )}
                  />
                </div>

                {/* Item Group */}
                <div className="prod-reg-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="prod-reg-form-label" style={{ margin: 0 }}>Item Group</label>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="prod-reg-add-btn"
                        onClick={handleOpenItemGroupDialog}
                        title="Manage Item Groups"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={itemGroup && !itemGroups.includes(itemGroup) ? [itemGroup, ...itemGroups] : itemGroups}
                    getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt ?? '')}
                    value={itemGroup || null}
                    inputValue={itemGroup}
                    onInputChange={(_, v) => setItemGroup(v ?? '')}
                    onChange={(_, v) => setItemGroup(typeof v === 'string' ? v : v ?? '')}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder="Choose or enter group"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '6px',
                            backgroundColor: '#ffffff',
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&:hover fieldset': { borderColor: '#cbd5e1' },
                            '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                          },
                        }}
                      />
                    )}
                  />
                </div>

                {/* Brand */}
                <div className="prod-reg-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="prod-reg-form-label" style={{ margin: 0 }}>Brand</label>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="prod-reg-add-btn"
                        onClick={handleOpenBrandDialog}
                        title="Manage Brands"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={brand && !brands.includes(brand) ? [brand, ...brands] : brands}
                    getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt ?? '')}
                    value={brand || null}
                    inputValue={brand}
                    onInputChange={(_, v) => setBrand(v ?? '')}
                    onChange={(_, v) => setBrand(typeof v === 'string' ? v : v ?? '')}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder="Choose or enter brand"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '6px',
                            backgroundColor: '#ffffff',
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&:hover fieldset': { borderColor: '#cbd5e1' },
                            '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                          },
                        }}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="prod-reg-form-grid">
                {/* Unit */}
                <div className="prod-reg-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="prod-reg-form-label" style={{ margin: 0 }}>
                      Unit of Measure <span className="prod-reg-required">*</span>
                    </label>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="prod-reg-add-btn"
                        onClick={handleOpenUnitDialog}
                        title="Manage Units of Measure"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                  <Autocomplete
                    size="small"
                    options={units}
                    getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt ? (opt.name || opt.shortCode) : '')}
                    isOptionEqualToValue={(opt, val) => (opt as Unit)?._id === (val as Unit)?._id}
                    value={units.find((u) => u._id === unitId) || null}
                    onChange={(_, val) => {
                      const selected = val as Unit | null;
                      setUnitId(selected?._id || '');
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder="Choose or select unit"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '6px',
                            backgroundColor: '#ffffff',
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&:hover fieldset': { borderColor: '#cbd5e1' },
                            '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                          },
                        }}
                      />
                    )}
                  />
                  <div className="prod-reg-hint">Base inventory measuring unit</div>
                </div>

                {/* VAT % */}
                <div className="prod-reg-form-group">
                  <label className="prod-reg-form-label">VAT Rate</label>
                  <input
                    type="text"
                    className="prod-reg-input"
                    value="5%"
                    disabled
                  />
                  <div className="prod-reg-hint locked">Locked: Standard UAE 5% VAT rate</div>
                </div>
              </div>
            </div>

            {/* Next Step Button (Inside General Details Tab View) */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              <button
                ref={nextBtnRef}
                type="button"
                className="prod-reg-btn prod-reg-btn-primary"
                onClick={handleGoToPricing}
                style={{ padding: '9px 24px', fontSize: '13px' }}
              >
                <span>Next: Pricing & Rates</span>
                <span style={{ fontSize: '15px' }}>→</span>
              </button>
            </div>
          </div>

          {/* Tab 2: Pricing & Rates */}
          <div style={{ display: activeTab === 'pricing' ? 'block' : 'none' }}>
            {/* Context Summary Bar */}
            <div className="prod-reg-pricing-summary">
              <div className="prod-reg-pricing-summary-item">
                <span className="prod-reg-pricing-summary-label">Product Name</span>
                <span className="prod-reg-pricing-summary-val">{name || '(No name entered yet)'}</span>
              </div>
              <div className="prod-reg-pricing-summary-item">
                <span className="prod-reg-pricing-summary-label">Product Code</span>
                <span className="prod-reg-pricing-summary-val">{code || 'Auto-generated'}</span>
              </div>
              <div className="prod-reg-pricing-summary-item">
                <span className="prod-reg-pricing-summary-label">Base Unit</span>
                <span className="prod-reg-pricing-summary-val">
                  {units.find((u) => u._id === unitId)?.shortCode || 'Not selected'}
                </span>
              </div>
              {imei && (
                <div className="prod-reg-pricing-summary-item">
                  <span className="prod-reg-pricing-summary-label">Barcode / IMEI</span>
                  <span className="prod-reg-pricing-summary-val">{imei}</span>
                </div>
              )}
            </div>

            {/* Section 3: Pricing & Rates */}
            <div className="prod-reg-form-section">
              <div className="prod-reg-section-header">Pricing & Rates (AED)</div>

              <div className="prod-reg-form-grid pricing-row">
                {/* Purchase Rate */}
                <div className="prod-reg-form-group">
                  <label className="prod-reg-form-label">Purchase Rate</label>
                  <input
                    ref={purchasePriceInputRef}
                    type="number"
                    step="0.01"
                    min="0"
                    className="prod-reg-input"
                    placeholder="0.00"
                    value={purchasePrice}
                    onChange={(e) => handlePurchasePriceChange(e.target.value)}
                  />
                  <div className="prod-reg-hint">Cost rate per unit</div>
                </div>

                {/* Percentage Column in between Purchase Rate and Retail Price */}
                <div className="prod-reg-form-group" style={{ minWidth: '85px', maxWidth: '110px' }}>
                  <label className="prod-reg-form-label" style={{ color: '#2563eb' }}>
                    + %
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="number"
                      step="any"
                      className="prod-reg-input"
                      placeholder="0"
                      value={markupPercentage}
                      onChange={(e) => handlePercentageChange(e.target.value)}
                      style={{
                        paddingRight: '20px',
                        borderColor: markupPercentage ? '#3b82f6' : '#cbd5e1',
                        backgroundColor: markupPercentage ? '#eff6ff' : '#ffffff',
                        color: '#1d4ed8',
                        fontWeight: 700,
                        textAlign: 'right',
                      }}
                      title="Enter percentage to add to purchase rate and fill all price columns"
                    />
                    <span
                      style={{
                        position: 'absolute',
                        right: '6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        color: markupPercentage ? '#2563eb' : '#94a3b8',
                        pointerEvents: 'none',
                      }}
                    >
                      %
                    </span>
                  </div>
                  <div className="prod-reg-hint" style={{ color: '#2563eb', fontWeight: 500 }}>
                    Auto-fill all
                  </div>
                </div>

                {/* Retail Price */}
                <div className="prod-reg-form-group">
                  <label className="prod-reg-form-label">Retail Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="prod-reg-input"
                    placeholder="0.00"
                    value={retailPrice}
                    onChange={(e) => setRetailPrice(e.target.value)}
                  />
                  <div className="prod-reg-hint">Standard retail selling price</div>
                </div>

                {/* Wholesale Price */}
                <div className="prod-reg-form-group">
                  <label className="prod-reg-form-label">Wholesale Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="prod-reg-input"
                    placeholder="0.00"
                    value={wholesalePrice}
                    onChange={(e) => setWholesalePrice(e.target.value)}
                  />
                  <div className="prod-reg-hint">Bulk / wholesale rate</div>
                </div>
              </div>

              <div className="prod-reg-form-grid">
                {/* Special Price 1 */}
                <div className="prod-reg-form-group">
                  <label className="prod-reg-form-label">Special Price 1</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="prod-reg-input"
                    placeholder="0.00"
                    value={specialPrice}
                    onChange={(e) => setSpecialPrice(e.target.value)}
                  />
                  <div className="prod-reg-hint">Promotional tier 1 rate</div>
                </div>

                {/* Special Price 2 */}
                <div className="prod-reg-form-group">
                  <label className="prod-reg-form-label">Special Price 2</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="prod-reg-input"
                    placeholder="0.00"
                    value={specialPrice2}
                    onChange={(e) => setSpecialPrice2(e.target.value)}
                  />
                  <div className="prod-reg-hint">Promotional tier 2 rate</div>
                </div>
              </div>

              {/* Profit Margin & Markup summary */}
              {(() => {
                const p = parseFloat(purchasePrice) || 0;
                const r = parseFloat(retailPrice) || 0;
                if (r > 0) {
                  const margin = r - p;
                  const markupPct = p > 0 ? ((margin / p) * 100).toFixed(1) : '100.0';
                  const marginPct = ((margin / r) * 100).toFixed(1);
                  return (
                    <div className="prod-reg-margin-card">
                      <div className="prod-reg-margin-item">
                        <span className="prod-reg-margin-label">Profit per Unit:</span>
                        <span className="prod-reg-margin-value" style={{ color: margin >= 0 ? '#15803d' : '#dc2626' }}>
                          {margin.toFixed(2)} AED
                        </span>
                      </div>
                      <div className="prod-reg-margin-item">
                        <span className="prod-reg-margin-label">Profit Margin:</span>
                        <span className="prod-reg-margin-value" style={{ color: margin >= 0 ? '#15803d' : '#dc2626' }}>
                          {marginPct}%
                        </span>
                      </div>
                      <div className="prod-reg-margin-item">
                        <span className="prod-reg-margin-label">Markup:</span>
                        <span className="prod-reg-margin-value" style={{ color: margin >= 0 ? '#15803d' : '#dc2626' }}>
                          {markupPct}%
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <div className="prod-reg-divider" />

            {/* Section 4: Inventory & Tracking */}
            <div className="prod-reg-form-section">
              <div className="prod-reg-section-header">Inventory & Tracking</div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: '#f8fafc',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0f172a' }}>Allow Batches</div>
                  <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: 2 }}>
                    {allowBatches
                      ? 'Batch-wise tracking active (FIFO, lot numbers, and expiry management)'
                      : 'Multi-unit packaging active (e.g. Piece, Box, Carton with individual rates)'}
                  </div>
                </div>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={allowBatches}
                      onChange={(e) => {
                        if (!e.target.checked) setDisableBatchesConfirmOpen(true);
                        else setEnableBatchesConfirmOpen(true);
                      }}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: '#10b981' },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#10b981' },
                      }}
                    />
                  }
                  label=""
                  sx={{ m: 0 }}
                />
              </div>

              {!allowBatches && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '12px', color: '#0f172a' }}>Multi-Unit Definitions</span>
                    <button type="button" className="prod-reg-add-btn" onClick={addMultiUnitRow} style={{ padding: '4px 8px', fontSize: '10.5px' }}>
                      <AddIcon sx={{ fontSize: '13px' }} /> Add Multi Unit
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#334155', borderBottom: '1px solid #cbd5e1' }}>
                          <th style={{ padding: '6px 8px', fontWeight: 700 }}>IMEI / Barcode</th>
                          <th style={{ padding: '6px 8px', fontWeight: 700 }}>Pcs Inside</th>
                          <th style={{ padding: '6px 8px', fontWeight: 700 }}>Unit</th>
                          <th style={{ padding: '6px 8px', fontWeight: 700 }}>Prices</th>
                          <th style={{ padding: '6px 8px', fontWeight: 700, width: 40 }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {multiUnits.map((row) => (
                          <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '4px 6px' }}>
                              <input
                                type="text"
                                className="prod-reg-input"
                                placeholder="IMEI / Barcode"
                                value={row.imei}
                                onChange={(e) => updateMultiUnit(row.id, 'imei', e.target.value)}
                              />
                            </td>
                            <td style={{ padding: '4px 6px', width: 90 }}>
                              <input
                                type="number"
                                className="prod-reg-input"
                                placeholder="1"
                                value={row.conversion}
                                onChange={(e) => updateMultiUnit(row.id, 'conversion', e.target.value)}
                              />
                            </td>
                            <td style={{ padding: '4px 6px', width: 110 }}>
                              <select
                                className="prod-reg-select"
                                value={row.unitId}
                                onChange={(e) => updateMultiUnit(row.id, 'unitId', e.target.value)}
                              >
                                {units.map((u) => (
                                  <option key={u._id} value={u._id}>{u.shortCode}</option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: '4px 6px', width: 80 }}>
                              <button
                                type="button"
                                className="prod-reg-add-btn"
                                onClick={() => setPricesDialogRowId(row.id)}
                                style={{ color: '#7c3aed', background: '#f5f3ff', borderColor: '#ddd6fe', padding: '3px 7px', fontSize: '10.5px' }}
                              >
                                <LocalOfferIcon sx={{ fontSize: '12px' }} /> Prices
                              </button>
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                              <IconButton size="small" onClick={() => removeMultiUnitRow(row.id)} sx={{ color: '#ef4444', p: '2px' }}>
                                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons (Inside Pricing & Rates Tab View) */}
            <div className="prod-reg-actions">
              <button
                type="button"
                className="prod-reg-btn prod-reg-btn-tertiary"
                onClick={() => setActiveTab('general')}
              >
                ← Back to General
              </button>

              <button
                ref={saveBtnRef}
                type="button"
                disabled={saving || (!!editingId && !editModeActive)}
                onClick={handleSave}
                className="prod-reg-btn prod-reg-btn-primary"
              >
                <span style={{ fontWeight: 'bold' }}>✓</span> Save
              </button>

              <button
                ref={editBtnRef}
                type="button"
                disabled={!editingId || saving}
                onClick={handleEditClick}
                className="prod-reg-btn prod-reg-btn-secondary"
              >
                ✎ Edit
              </button>

              <button
                type="button"
                onClick={handleClear}
                className="prod-reg-btn prod-reg-btn-clear"
              >
                ✕ Clear
              </button>

              <button
                type="button"
                disabled={!editingId || saving}
                onClick={handleDeleteClick}
                className="prod-reg-btn prod-reg-btn-danger"
              >
                🗑 Delete
              </button>

              <button
                type="button"
                onClick={() => navigate('/master/products')}
                className="prod-reg-btn prod-reg-btn-tertiary"
              >
                Cancel
              </button>
            </div>
          </div>
          </form>
        </div>
      </div>

      {/* Disable Batches Confirmation Dialog */}
      <Dialog open={disableBatchesConfirmOpen} onClose={() => setDisableBatchesConfirmOpen(false)} PaperProps={{ sx: { borderRadius: 2, maxWidth: 420 } }}>
        <DialogTitle sx={{ fontWeight: 600, color: '#d97706', fontSize: '1rem' }}>Disable Batches?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#475569' }}>
            If you disable batches, this product's current batches will be merged and batch-wise tracking will no longer be available. This action will take effect when you save.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDisableBatchesConfirmOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={() => { setAllowBatches(false); setDisableBatchesConfirmOpen(false); }} autoFocus sx={{ textTransform: 'none', bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' } }}>Yes, Disable</Button>
        </DialogActions>
      </Dialog>

      {/* Enable Batches Confirmation Dialog */}
      <Dialog open={enableBatchesConfirmOpen} onClose={() => setEnableBatchesConfirmOpen(false)} PaperProps={{ sx: { borderRadius: 2, maxWidth: 420 } }}>
        <DialogTitle sx={{ fontWeight: 600, color: '#2563eb', fontSize: '1rem' }}>Enable Batches?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#475569' }}>
            If you enable batches, the multi-unit option will no longer be available for this product. Existing multi-units will be removed when you save.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEnableBatchesConfirmOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={() => { setAllowBatches(true); setMultiUnits([]); setEnableBatchesConfirmOpen(false); }} autoFocus sx={{ textTransform: 'none', bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>Yes, Enable</Button>
        </DialogActions>
      </Dialog>

      {/* Multi-Unit Prices Dialog */}
      <Dialog open={!!pricesDialogRowId} onClose={() => setPricesDialogRowId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 600, color: '#7c3aed', pb: 0.5, fontSize: '1rem' }}>
          Multi-Unit Prices
          {pricesDialogRowId && (() => {
            const row = multiUnits.find((r) => r.id === pricesDialogRowId);
            const unitName = units.find((u) => u._id === row?.unitId)?.shortCode;
            return row ? <Typography variant="caption" sx={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>IMEI: {row.imei || '—'} | Unit: {unitName || '—'}</Typography> : null;
          })()}
        </DialogTitle>
        <DialogContent sx={{ pt: 1.5 }}>
          {pricesDialogRowId && (() => {
            const row = multiUnits.find((r) => r.id === pricesDialogRowId);
            if (!row) return null;
            const numStyle = { '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 }, '& input[type=number]': { MozAppearance: 'textfield' } };
            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <TextField size="small" fullWidth type="number" label="Wholesale Price" value={row.wholesale} onChange={(e) => updateMultiUnit(row.id, 'wholesale', e.target.value)} InputLabelProps={labelShrink} sx={numStyle} />
                <TextField size="small" fullWidth type="number" label="Retail Price" value={row.retail} onChange={(e) => updateMultiUnit(row.id, 'retail', e.target.value)} InputLabelProps={labelShrink} sx={numStyle} />
                <TextField size="small" fullWidth type="number" label="Special Price 1" value={row.specialPrice1} onChange={(e) => updateMultiUnit(row.id, 'specialPrice1', e.target.value)} InputLabelProps={labelShrink} sx={numStyle} />
                <TextField size="small" fullWidth type="number" label="Special Price 2" value={row.specialPrice2} onChange={(e) => updateMultiUnit(row.id, 'specialPrice2', e.target.value)} InputLabelProps={labelShrink} sx={numStyle} />
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPricesDialogRowId(null)} variant="contained" size="small" autoFocus sx={{ bgcolor: '#7c3aed', textTransform: 'none', '&:hover': { bgcolor: '#6d28d9' } }}>Done</Button>
        </DialogActions>
      </Dialog>

      {/* Category Management Dialog */}
      <Dialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2.5, p: 0.5 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocalOfferIcon sx={{ color: '#2563eb', fontSize: 22 }} />
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem', color: '#1e293b' }}>
              Category Management
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setCategoryDialogOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2, pb: 2 }}>
          {/* Add / Edit Form Card */}
          <Box
            sx={{
              p: 2,
              mb: 2.5,
              borderRadius: 2,
              bgcolor: categoryDialogMode === 'edit' ? '#fefce8' : '#f8fafc',
              border: '1px solid',
              borderColor: categoryDialogMode === 'edit' ? '#fde047' : '#e2e8f0',
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                mb: 1.5,
                color: categoryDialogMode === 'edit' ? '#854d0e' : '#334155',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {categoryDialogMode === 'edit' ? (
                <>
                  <EditIcon sx={{ fontSize: 16 }} /> Edit Category
                </>
              ) : (
                <>
                  <AddIcon sx={{ fontSize: 16 }} /> Add New Category
                </>
              )}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <TextField
                size="small"
                label="Category Name"
                placeholder="e.g. Beverages"
                value={categoryDialogName}
                onChange={(e) => setCategoryDialogName(e.target.value)}
                InputLabelProps={labelShrink}
                required
                sx={{ flex: '1 1 240px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveCategory();
                  }
                }}
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 0.2 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSaveCategory}
                  disabled={savingCategory || !categoryDialogName.trim()}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    bgcolor: categoryDialogMode === 'edit' ? '#d97706' : '#2563eb',
                    '&:hover': { bgcolor: categoryDialogMode === 'edit' ? '#b45309' : '#1d4ed8' },
                    minHeight: 40,
                    px: 2,
                  }}
                >
                  {savingCategory ? 'Saving...' : categoryDialogMode === 'edit' ? 'Update' : '+ Add'}
                </Button>
                {categoryDialogMode === 'edit' && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleCancelEditCategory}
                    sx={{ textTransform: 'none', minHeight: 40, borderColor: '#cbd5e1', color: '#64748b' }}
                  >
                    Cancel
                  </Button>
                )}
              </Box>
            </Box>
          </Box>

          {/* List Search & Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <TextField
              size="small"
              placeholder="Search existing categories..."
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8', fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 260 }}
            />
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>
              Total: {categories.length} {categories.length === 1 ? 'category' : 'categories'}
            </Typography>
          </Box>

          {/* Existing Categories Table */}
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ maxHeight: 260, overflowY: 'auto', borderRadius: 1.5, borderColor: '#e2e8f0' }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem' }}>Category Name</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem', width: 160 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categories
                  .filter((cat) => {
                    const q = categoryFilter.toLowerCase().trim();
                    if (!q) return true;
                    return cat.name.toLowerCase().includes(q);
                  })
                  .map((cat) => {
                    const isSelected = categoryId === cat._id;
                    const isEditing = editingCategoryId === cat._id;
                    return (
                      <TableRow
                        key={cat._id}
                        hover
                        sx={{
                          bgcolor: isEditing ? '#fef9c3' : isSelected ? '#eff6ff' : 'inherit',
                          '&:last-child td, &:last-child th': { border: 0 },
                        }}
                      >
                        <TableCell sx={{ fontSize: '0.85rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <span>{cat.name}</span>
                            {isSelected && (
                              <Chip
                                label="Active"
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                            <Button
                              size="small"
                              variant={isSelected ? 'contained' : 'outlined'}
                              color="primary"
                              onClick={() => {
                                setCategoryId(cat._id);
                                setCategoryDialogOpen(false);
                              }}
                              sx={{
                                textTransform: 'none',
                                py: 0.2,
                                px: 1,
                                minWidth: 'auto',
                                fontSize: '0.75rem',
                                height: 26,
                              }}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </Button>
                            <IconButton
                              size="small"
                              onClick={() =>
                                checkUsageAndProceed(
                                  'category',
                                  'Category',
                                  cat._id,
                                  cat.name,
                                  'edit',
                                  () => handleStartEditCategory(cat)
                                )
                              }
                              title="Edit"
                              disabled={checkingUsage}
                              sx={{ color: '#b45309', p: 0.5 }}
                            >
                              <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() =>
                                checkUsageAndProceed(
                                  'category',
                                  'Category',
                                  cat._id,
                                  cat.name,
                                  'delete',
                                  () => handleOpenDeleteCategory(cat)
                                )
                              }
                              title="Delete"
                              disabled={checkingUsage}
                              sx={{ color: '#ef4444', p: 0.5 }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {categories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} align="center" sx={{ py: 3, color: '#94a3b8' }}>
                      No categories found. Add your first category above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button
            onClick={() => setCategoryDialogOpen(false)}
            variant="outlined"
            sx={{ textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Category Confirmation Dialog */}
      <Dialog open={categoryDeleteDialogOpen} onClose={() => setCategoryDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: '#dc2626' }}>Delete Category?</DialogTitle>
        <DialogContent>
          Are you sure you want to delete category &quot;{deletingCategory?.name}&quot;?
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setCategoryDeleteDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleConfirmDeleteCategory} autoFocus sx={{ textTransform: 'none' }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Item Group Management Dialog */}
      <Dialog
        open={itemGroupDialogOpen}
        onClose={() => setItemGroupDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2.5, p: 0.5 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ListIcon sx={{ color: '#2563eb', fontSize: 22 }} />
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem', color: '#1e293b' }}>
              Item Group Management
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setItemGroupDialogOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2, pb: 2 }}>
          {/* Add / Edit Form Card */}
          <Box
            sx={{
              p: 2,
              mb: 2.5,
              borderRadius: 2,
              bgcolor: itemGroupDialogMode === 'edit' ? '#fefce8' : '#f8fafc',
              border: '1px solid',
              borderColor: itemGroupDialogMode === 'edit' ? '#fde047' : '#e2e8f0',
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                mb: 1.5,
                color: itemGroupDialogMode === 'edit' ? '#854d0e' : '#334155',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {itemGroupDialogMode === 'edit' ? (
                <>
                  <EditIcon sx={{ fontSize: 16 }} /> Edit Item Group
                </>
              ) : (
                <>
                  <AddIcon sx={{ fontSize: 16 }} /> Add New Item Group
                </>
              )}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <TextField
                size="small"
                label="Item Group Name"
                placeholder="e.g. Dairy Products"
                value={itemGroupDialogName}
                onChange={(e) => setItemGroupDialogName(e.target.value)}
                InputLabelProps={labelShrink}
                required
                sx={{ flex: '1 1 240px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveItemGroup();
                  }
                }}
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 0.2 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSaveItemGroup}
                  disabled={!itemGroupDialogName.trim()}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    bgcolor: itemGroupDialogMode === 'edit' ? '#d97706' : '#2563eb',
                    '&:hover': { bgcolor: itemGroupDialogMode === 'edit' ? '#b45309' : '#1d4ed8' },
                    minHeight: 40,
                    px: 2,
                  }}
                >
                  {itemGroupDialogMode === 'edit' ? 'Update' : '+ Add'}
                </Button>
                {itemGroupDialogMode === 'edit' && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleCancelEditItemGroup}
                    sx={{ textTransform: 'none', minHeight: 40, borderColor: '#cbd5e1', color: '#64748b' }}
                  >
                    Cancel
                  </Button>
                )}
              </Box>
            </Box>
          </Box>

          {/* Search & Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <TextField
              size="small"
              placeholder="Search existing item groups..."
              value={itemGroupFilter}
              onChange={(e) => setItemGroupFilter(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8', fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 260 }}
            />
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>
              Total: {itemGroups.length} {itemGroups.length === 1 ? 'group' : 'groups'}
            </Typography>
          </Box>

          {/* Existing Groups Table */}
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ maxHeight: 260, overflowY: 'auto', borderRadius: 1.5, borderColor: '#e2e8f0' }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem' }}>Group Name</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem', width: 160 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {itemGroups
                  .filter((g) => {
                    const q = itemGroupFilter.toLowerCase().trim();
                    if (!q) return true;
                    return g.toLowerCase().includes(q);
                  })
                  .map((g) => {
                    const isSelected = itemGroup === g;
                    const isEditing = oldItemGroupName === g && itemGroupDialogMode === 'edit';
                    return (
                      <TableRow
                        key={g}
                        hover
                        sx={{
                          bgcolor: isEditing ? '#fef9c3' : isSelected ? '#eff6ff' : 'inherit',
                          '&:last-child td, &:last-child th': { border: 0 },
                        }}
                      >
                        <TableCell sx={{ fontSize: '0.85rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <span>{g}</span>
                            {isSelected && (
                              <Chip
                                label="Active"
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                            <Button
                              size="small"
                              variant={isSelected ? 'contained' : 'outlined'}
                              color="primary"
                              onClick={() => {
                                setItemGroup(g);
                                setItemGroupDialogOpen(false);
                              }}
                              sx={{
                                textTransform: 'none',
                                py: 0.2,
                                px: 1,
                                minWidth: 'auto',
                                fontSize: '0.75rem',
                                height: 26,
                              }}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </Button>
                            <IconButton
                              size="small"
                              onClick={() =>
                                checkUsageAndProceed(
                                  'itemGroup',
                                  'Item Group',
                                  g,
                                  g,
                                  'edit',
                                  () => handleStartEditItemGroup(g)
                                )
                              }
                              title="Edit"
                              disabled={checkingUsage}
                              sx={{ color: '#b45309', p: 0.5 }}
                            >
                              <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() =>
                                checkUsageAndProceed(
                                  'itemGroup',
                                  'Item Group',
                                  g,
                                  g,
                                  'delete',
                                  () => handleOpenDeleteItemGroup(g)
                                )
                              }
                              title="Delete"
                              disabled={checkingUsage}
                              sx={{ color: '#ef4444', p: 0.5 }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {itemGroups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} align="center" sx={{ py: 3, color: '#94a3b8' }}>
                      No item groups found. Add your first group above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button
            onClick={() => setItemGroupDialogOpen(false)}
            variant="outlined"
            sx={{ textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Item Group Confirmation Dialog */}
      <Dialog open={itemGroupDeleteDialogOpen} onClose={() => setItemGroupDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: '#dc2626' }}>Delete Item Group?</DialogTitle>
        <DialogContent>
          Are you sure you want to delete item group &quot;{deletingItemGroup}&quot;?
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setItemGroupDeleteDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleConfirmDeleteItemGroup} autoFocus sx={{ textTransform: 'none' }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Brand Management Dialog */}
      <Dialog
        open={brandDialogOpen}
        onClose={() => setBrandDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2.5, p: 0.5 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocalOfferIcon sx={{ color: '#2563eb', fontSize: 22 }} />
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem', color: '#1e293b' }}>
              Brand Management
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setBrandDialogOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2, pb: 2 }}>
          {/* Add / Edit Form Card */}
          <Box
            sx={{
              p: 2,
              mb: 2.5,
              borderRadius: 2,
              bgcolor: brandDialogMode === 'edit' ? '#fefce8' : '#f8fafc',
              border: '1px solid',
              borderColor: brandDialogMode === 'edit' ? '#fde047' : '#e2e8f0',
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                mb: 1.5,
                color: brandDialogMode === 'edit' ? '#854d0e' : '#334155',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {brandDialogMode === 'edit' ? (
                <>
                  <EditIcon sx={{ fontSize: 16 }} /> Edit Brand
                </>
              ) : (
                <>
                  <AddIcon sx={{ fontSize: 16 }} /> Add New Brand
                </>
              )}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <TextField
                size="small"
                label="Brand Name"
                placeholder="e.g. Nestle"
                value={brandDialogName}
                onChange={(e) => setBrandDialogName(e.target.value)}
                InputLabelProps={labelShrink}
                required
                sx={{ flex: '1 1 240px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveBrand();
                  }
                }}
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 0.2 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSaveBrand}
                  disabled={!brandDialogName.trim()}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    bgcolor: brandDialogMode === 'edit' ? '#d97706' : '#2563eb',
                    '&:hover': { bgcolor: brandDialogMode === 'edit' ? '#b45309' : '#1d4ed8' },
                    minHeight: 40,
                    px: 2,
                  }}
                >
                  {brandDialogMode === 'edit' ? 'Update' : '+ Add'}
                </Button>
                {brandDialogMode === 'edit' && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleCancelEditBrand}
                    sx={{ textTransform: 'none', minHeight: 40, borderColor: '#cbd5e1', color: '#64748b' }}
                  >
                    Cancel
                  </Button>
                )}
              </Box>
            </Box>
          </Box>

          {/* Search & Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <TextField
              size="small"
              placeholder="Search existing brands..."
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8', fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 260 }}
            />
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>
              Total: {brands.length} {brands.length === 1 ? 'brand' : 'brands'}
            </Typography>
          </Box>

          {/* Existing Brands Table */}
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ maxHeight: 260, overflowY: 'auto', borderRadius: 1.5, borderColor: '#e2e8f0' }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem' }}>Brand Name</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem', width: 160 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {brands
                  .filter((b) => {
                    const q = brandFilter.toLowerCase().trim();
                    if (!q) return true;
                    return b.toLowerCase().includes(q);
                  })
                  .map((b) => {
                    const isSelected = brand === b;
                    const isEditing = oldBrandName === b && brandDialogMode === 'edit';
                    return (
                      <TableRow
                        key={b}
                        hover
                        sx={{
                          bgcolor: isEditing ? '#fef9c3' : isSelected ? '#eff6ff' : 'inherit',
                          '&:last-child td, &:last-child th': { border: 0 },
                        }}
                      >
                        <TableCell sx={{ fontSize: '0.85rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <span>{b}</span>
                            {isSelected && (
                              <Chip
                                label="Active"
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                            <Button
                              size="small"
                              variant={isSelected ? 'contained' : 'outlined'}
                              color="primary"
                              onClick={() => {
                                setBrand(b);
                                setBrandDialogOpen(false);
                              }}
                              sx={{
                                textTransform: 'none',
                                py: 0.2,
                                px: 1,
                                minWidth: 'auto',
                                fontSize: '0.75rem',
                                height: 26,
                              }}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </Button>
                            <IconButton
                              size="small"
                              onClick={() =>
                                checkUsageAndProceed(
                                  'brand',
                                  'Brand',
                                  b,
                                  b,
                                  'edit',
                                  () => handleStartEditBrand(b)
                                )
                              }
                              title="Edit"
                              disabled={checkingUsage}
                              sx={{ color: '#b45309', p: 0.5 }}
                            >
                              <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() =>
                                checkUsageAndProceed(
                                  'brand',
                                  'Brand',
                                  b,
                                  b,
                                  'delete',
                                  () => handleOpenDeleteBrand(b)
                                )
                              }
                              title="Delete"
                              disabled={checkingUsage}
                              sx={{ color: '#ef4444', p: 0.5 }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {brands.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} align="center" sx={{ py: 3, color: '#94a3b8' }}>
                      No brands found. Add your first brand above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button
            onClick={() => setBrandDialogOpen(false)}
            variant="outlined"
            sx={{ textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Brand Confirmation Dialog */}
      <Dialog open={brandDeleteDialogOpen} onClose={() => setBrandDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: '#dc2626' }}>Delete Brand?</DialogTitle>
        <DialogContent>
          Are you sure you want to delete brand &quot;{deletingBrand}&quot;?
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setBrandDeleteDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleConfirmDeleteBrand} autoFocus sx={{ textTransform: 'none' }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Unit of Measure Management Dialog */}
      <Dialog
        open={unitDialogOpen}
        onClose={() => setUnitDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2.5, p: 0.5 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InventoryIcon sx={{ color: '#2563eb', fontSize: 22 }} />
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem', color: '#1e293b' }}>
              Unit of Measure Management
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setUnitDialogOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2, pb: 2 }}>
          {/* Add / Edit Form Card */}
          <Box
            sx={{
              p: 2,
              mb: 2.5,
              borderRadius: 2,
              bgcolor: unitDialogMode === 'edit' ? '#fefce8' : '#f8fafc',
              border: '1px solid',
              borderColor: unitDialogMode === 'edit' ? '#fde047' : '#e2e8f0',
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                mb: 1.5,
                color: unitDialogMode === 'edit' ? '#854d0e' : '#334155',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {unitDialogMode === 'edit' ? (
                <>
                  <EditIcon sx={{ fontSize: 16 }} /> Edit Unit of Measure
                </>
              ) : (
                <>
                  <AddIcon sx={{ fontSize: 16 }} /> Add New Unit of Measure
                </>
              )}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <TextField
                size="small"
                label="Unit Name"
                placeholder="e.g. Pieces, Box, Kilogram"
                value={unitDialogName}
                onChange={(e) => setUnitDialogName(e.target.value)}
                InputLabelProps={labelShrink}
                required
                sx={{ flex: '1 1 240px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveUnit();
                  }
                }}
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 0.2 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSaveUnit}
                  disabled={savingUnit || !unitDialogName.trim()}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    bgcolor: unitDialogMode === 'edit' ? '#d97706' : '#2563eb',
                    '&:hover': { bgcolor: unitDialogMode === 'edit' ? '#b45309' : '#1d4ed8' },
                    minHeight: 40,
                    px: 2,
                  }}
                >
                  {savingUnit ? 'Saving...' : unitDialogMode === 'edit' ? 'Update' : '+ Add'}
                </Button>
                {unitDialogMode === 'edit' && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleCancelEditUnit}
                    sx={{ textTransform: 'none', minHeight: 40, borderColor: '#cbd5e1', color: '#64748b' }}
                  >
                    Cancel
                  </Button>
                )}
              </Box>
            </Box>
          </Box>

          {/* Search & Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <TextField
              size="small"
              placeholder="Search existing units..."
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8', fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 260 }}
            />
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>
              Total: {units.length} {units.length === 1 ? 'unit' : 'units'}
            </Typography>
          </Box>

          {/* Existing Units Table */}
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ maxHeight: 260, overflowY: 'auto', borderRadius: 1.5, borderColor: '#e2e8f0' }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem' }}>Unit Name</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem', width: 160 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {units
                  .filter((u) => {
                    const q = unitFilter.toLowerCase().trim();
                    if (!q) return true;
                    return (u.name && u.name.toLowerCase().includes(q)) || (u.shortCode && u.shortCode.toLowerCase().includes(q));
                  })
                  .map((u) => {
                    const isSelected = unitId === u._id;
                    const isEditing = editingUnitId === u._id;
                    return (
                      <TableRow
                        key={u._id}
                        hover
                        sx={{
                          bgcolor: isEditing ? '#fef9c3' : isSelected ? '#eff6ff' : 'inherit',
                          '&:last-child td, &:last-child th': { border: 0 },
                        }}
                      >
                        <TableCell sx={{ fontSize: '0.85rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <span>{u.name || u.shortCode}</span>
                            {isSelected && (
                              <Chip
                                label="Active"
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                            <Button
                              size="small"
                              variant={isSelected ? 'contained' : 'outlined'}
                              color="primary"
                              onClick={() => {
                                setUnitId(u._id);
                                setUnitDialogOpen(false);
                              }}
                              sx={{
                                textTransform: 'none',
                                py: 0.2,
                                px: 1,
                                minWidth: 'auto',
                                fontSize: '0.75rem',
                                height: 26,
                              }}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </Button>
                            <IconButton
                              size="small"
                              onClick={() =>
                                checkUsageAndProceed(
                                  'unit',
                                  'Unit of Measure',
                                  u._id,
                                  u.name || u.shortCode,
                                  'edit',
                                  () => handleStartEditUnit(u)
                                )
                              }
                              title="Edit"
                              disabled={checkingUsage}
                              sx={{ color: '#b45309', p: 0.5 }}
                            >
                              <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() =>
                                checkUsageAndProceed(
                                  'unit',
                                  'Unit of Measure',
                                  u._id,
                                  u.name || u.shortCode,
                                  'delete',
                                  () => handleOpenDeleteUnit(u)
                                )
                              }
                              title="Delete"
                              disabled={checkingUsage}
                              sx={{ color: '#ef4444', p: 0.5 }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {units.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} align="center" sx={{ py: 3, color: '#94a3b8' }}>
                      No units found. Add your first unit above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button
            onClick={() => setUnitDialogOpen(false)}
            variant="outlined"
            sx={{ textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Unit Confirmation Dialog */}
      <Dialog open={unitDeleteDialogOpen} onClose={() => setUnitDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: '#dc2626' }}>Delete Unit?</DialogTitle>
        <DialogContent>
          Are you sure you want to delete unit &quot;{deletingUnit?.name || deletingUnit?.shortCode}&quot;?
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setUnitDeleteDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleConfirmDeleteUnit} autoFocus sx={{ textTransform: 'none' }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* In-Use Product Details Dialog */}
      <Dialog
        open={inUseDialogOpen}
        onClose={() => setInUseDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2.5, p: 0.5 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                bgcolor: inUseHasTransactions ? '#fee2e2' : '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WarningAmberIcon sx={{ color: inUseHasTransactions ? '#dc2626' : '#d97706', fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b', lineHeight: 1.2 }}>
                Cannot {inUseActionType === 'delete' ? 'Delete' : 'Edit'} {inUseEntityType}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                &quot;{inUseEntityName}&quot; is currently linked to registered products
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setInUseDialogOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2, pb: 2 }}>
          {/* Warning Banner */}
          <Box
            sx={{
              p: 2,
              mb: 2,
              borderRadius: 2,
              bgcolor: inUseHasTransactions ? '#fef2f2' : '#fffbeb',
              border: '1px solid',
              borderColor: inUseHasTransactions ? '#fca5a5' : '#fde68a',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: inUseHasTransactions ? '#991b1b' : '#92400e',
                mb: 0.5,
              }}
            >
              {inUseHasTransactions
                ? `⚠️ This ${inUseEntityType.toLowerCase()} is assigned to products that have active sales or inventory transactions!`
                : `⚠️ This ${inUseEntityType.toLowerCase()} is currently assigned to ${inUseProducts.length} registered product(s).`}
            </Typography>
            <Typography variant="body2" sx={{ color: inUseHasTransactions ? '#7f1d1d' : '#78350f', fontSize: '0.85rem' }}>
              To maintain data integrity and prevent inconsistencies in product catalog and transactions, editing or deleting a {inUseEntityType.toLowerCase()} in use is not allowed.
            </Typography>
          </Box>

          {/* Associated Products Table */}
          <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#334155' }}>
              Associated Products ({inUseProducts.length}):
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              Showing products using &quot;{inUseEntityName}&quot;
            </Typography>
          </Box>

          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ maxHeight: 300, overflowY: 'auto', borderRadius: 1.5, borderColor: '#e2e8f0' }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem', width: 110 }}>Product Code</TableCell>
                  <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem' }}>Product Name</TableCell>
                  <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem', width: 140 }}>IMEI / Barcode</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem', width: 100 }}>Retail Price</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#f8fafc', color: '#475569', fontSize: '0.8rem', width: 140 }}>Transaction Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {inUseProducts.map((p) => (
                  <TableRow key={p._id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#2563eb' }}>
                      {p.code || '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>
                      {p.name}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.85rem', color: '#64748b', fontFamily: 'monospace' }}>
                      {p.imei || '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#059669' }}>
                      AED {Number(p.retailPrice || 0).toFixed(2)}
                    </TableCell>
                    <TableCell align="center">
                      {p.hasTransactions ? (
                        <Chip
                          label="Has Transactions"
                          size="small"
                          sx={{
                            bgcolor: '#fee2e2',
                            color: '#b91c1c',
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            height: 22,
                          }}
                        />
                      ) : (
                        <Chip
                          label="Registered Product"
                          size="small"
                          sx={{
                            bgcolor: '#e0f2fe',
                            color: '#0369a1',
                            fontWeight: 500,
                            fontSize: '0.7rem',
                            height: 22,
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {inUseProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3, color: '#94a3b8' }}>
                      No product details found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5, display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
            To edit or remove this field, reassign or delete the associated products first.
          </Typography>
          <Button
            onClick={() => setInUseDialogOpen(false)}
            variant="contained"
            sx={{
              textTransform: 'none',
              bgcolor: '#334155',
              '&:hover': { bgcolor: '#1e293b' },
              px: 3,
              borderRadius: 1.5,
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={saveConfirmOpen} onClose={() => !saving && setSaveConfirmOpen(false)}>
        <DialogTitle>Save product?</DialogTitle>
        <DialogContent>Do you want to save the product details?</DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveConfirmOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={performSave} disabled={saving} autoFocus>OK</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editConfirmOpen} onClose={() => setEditConfirmOpen(false)}>
        <DialogTitle>Edit</DialogTitle>
        <DialogContent>Do you want to edit?</DialogContent>
        <DialogActions>
          <Button onClick={() => setEditConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEditConfirm} autoFocus>OK</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editedDialogOpen} onClose={() => setEditedDialogOpen(false)}>
        <DialogTitle>Edited</DialogTitle>
        <DialogContent>Product has been edited successfully.</DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setEditedDialogOpen(false)} autoFocus>OK</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete product?</DialogTitle>
        <DialogContent>Are you sure you want to delete this product? The product cannot be deleted if it has transactions.</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm} autoFocus>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Change Product Name Dialog */}
      <Dialog open={changeNameDialogOpen} onClose={() => setChangeNameDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Change Product Name</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            size="small"
            label="Product Code"
            value={changeNameCode}
            disabled
            margin="normal"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth
            size="small"
            label="Product Name"
            value={changeNameValue}
            onChange={(e) => setChangeNameValue(e.target.value)}
            margin="normal"
            required
            autoFocus
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangeNameDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleChangeNameSave}
            disabled={changeNameSaving || !changeNameValue.trim()}
            autoFocus
          >
            {changeNameSaving ? 'Updating...' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onClose={() => setSuccessDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2, minWidth: 350 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>Success</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{successDialogMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" onClick={() => setSuccessDialogOpen(false)} autoFocus sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' }, boxShadow: 'none' }}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2, minWidth: 350 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626' }}>Error</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{errorDialogMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" onClick={() => setErrorDialogOpen(false)} autoFocus sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' }, boxShadow: 'none' }}>OK</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
