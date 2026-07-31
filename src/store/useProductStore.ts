import { create } from 'zustand'
import type { Product } from '@/types'
import { uid } from '@/utils/helpers'
import { remote } from '@/lib/cloud'

interface ProductState {
  products: Product[]
  brands: string[]
  categories: string[]
  addProduct: (data: Omit<Product, 'id' | 'createdAt'>) => Product
  updateProduct: (id: string, data: Partial<Product>) => void
  deleteProduct: (id: string) => void
  /** Increase stock + refresh prices/min (and optional expiration) after a purchase line. */
  receiveStock: (
    productId: string,
    qty: number,
    patch: {
      purchasePrice: number
      salePrice: number
      minQuantity: number
      hasExpiration?: boolean
      expirationDate?: string
    },
  ) => void
  /** Decrease stock after a sale. */
  reduceStock: (productId: string, qty: number) => void
  addBrand: (name: string) => void
  addCategory: (name: string) => void
}

export const useProductStore = create<ProductState>()(
  (set) => ({
    products: [],
    brands: [],
    categories: [],
    addProduct: (data) => {
      const product: Product = { ...data, id: uid('p'), createdAt: new Date().toISOString() }
      set((s) => ({ products: [product, ...s.products] }))
      remote.products.save(product)
      return product
    },
    updateProduct: (id, data) => {
      set((s) => ({
        products: s.products.map((p) => (p.id === id ? { ...p, ...data } : p)),
      }))
      remote.products.patch(id, data)
    },
    deleteProduct: (id) => {
      set((s) => ({ products: s.products.filter((p) => p.id !== id) }))
      remote.products.remove(id)
    },
    // Stock movements are written server-side by create_purchase() / create_sale()
    // so the cloud quantity stays authoritative and transactional.
    receiveStock: (productId, qty, patch) =>
      set((s) => ({
        products: s.products.map((p) =>
          p.id === productId
            ? {
                ...p,
                quantity: p.quantity + qty,
                purchasePrice: patch.purchasePrice,
                salePrice: patch.salePrice,
                minQuantity: patch.minQuantity,
                // Only overwrite expiration fields when the purchase line carries them,
                // so re-stocking without expiry keeps the product's existing setting.
                ...(patch.hasExpiration !== undefined ? { hasExpiration: patch.hasExpiration } : {}),
                ...(patch.hasExpiration
                  ? { expirationDate: patch.expirationDate }
                  : patch.hasExpiration === false
                    ? { expirationDate: undefined }
                    : {}),
              }
            : p,
        ),
      })),
    reduceStock: (productId, qty) =>
      set((s) => ({
        products: s.products.map((p) =>
          p.id === productId ? { ...p, quantity: Math.max(0, p.quantity - qty) } : p,
        ),
      })),
    addBrand: (name) =>
      set((s) => {
        if (s.brands.includes(name)) return s
        remote.products.addBrand(name)
        return { brands: [...s.brands, name] }
      }),
    addCategory: (name) =>
      set((s) => {
        if (s.categories.includes(name)) return s
        remote.products.addCategory(name)
        return { categories: [...s.categories, name] }
      }),
  }),
)
