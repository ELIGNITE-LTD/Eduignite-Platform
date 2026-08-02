/**
 * Performance Optimization Utilities
 * Code splitting, lazy loading, caching, and bundle optimization strategies
 */

export interface PerformanceMetrics {
  pageLoadTime: number; // milliseconds
  firstContentfulPaint: number; // milliseconds
  largestContentfulPaint: number; // milliseconds
  cumulativeLayoutShift: number; // 0-1 score
  timeToInteractive: number; // milliseconds
  bundleSize: number; // bytes
  cacheHitRate: number; // percentage
}

export interface CacheConfig {
  key: string;
  ttl: number; // Time to live in seconds
  maxSize?: number; // Maximum cache size in bytes
  strategy: "LRU" | "FIFO" | "LFU"; // Cache eviction strategy
}

export interface LazyLoadConfig {
  threshold: number; // Intersection observer threshold
  rootMargin: string; // e.g., "50px"
  loadingPlaceholder?: string;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export class CacheManager {
  private static instance: CacheManager;
  private cache: Map<string, { data: any; expiresAt: number }> = new Map();
  private configs: Map<string, CacheConfig> = new Map();

  private constructor() {}

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Set cache configuration
   */
  setConfig(config: CacheConfig): void {
    this.configs.set(config.key, config);
  }

  /**
   * Get cached value
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cache value
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const config = this.configs.get(key);
    const expiresAt = Date.now() + ((ttl || config?.ttl || 3600) * 1000);

    this.cache.set(key, {
      data,
      expiresAt,
    });
  }

  /**
   * Clear cache
   */
  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache stats
   */
  getStats(): {
    size: number;
    entries: number;
    hitRate: number;
  } {
    return {
      size: this.cache.size,
      entries: this.cache.size,
      hitRate: 0.85, // Placeholder
    };
  }
}

// ============================================================================
// LAZY LOADING UTILITIES
// ============================================================================

export function setupLazyLoading(config: LazyLoadConfig): IntersectionObserver {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLImageElement;
          if (element.dataset.src) {
            element.src = element.dataset.src;
            element.removeAttribute("data-src");
            observer.unobserve(element);
          }
        }
      });
    },
    {
      threshold: config.threshold,
      rootMargin: config.rootMargin,
    }
  );

  return observer;
}

export function lazyLoadImages(selector: string, config: LazyLoadConfig): void {
  if (typeof document === "undefined") return;

  const observer = setupLazyLoading(config);
  const images = document.querySelectorAll(selector);

  images.forEach((img) => {
    observer.observe(img);
  });
}

// ============================================================================
// CODE SPLITTING CONFIGURATION
// ============================================================================

export const CODE_SPLIT_ROUTES = {
  // Dashboard modules
  dashboard: () => import("@/app/dashboard"),
  students: () => import("@/app/dashboard/students"),
  idCards: () => import("@/app/dashboard/id-cards"),
  transcripts: () => import("@/app/dashboard/transcripts"),
  grades: () => import("@/app/dashboard/grades"),
  attendance: () => import("@/app/dashboard/attendance"),
  fees: () => import("@/app/dashboard/fees"),
  
  // Admin modules
  platformSettings: () => import("@/app/dashboard/platform-settings"),
  schools: () => import("@/app/dashboard/schools"),
  staff: () => import("@/app/dashboard/staff"),
  
  // User modules
  profile: () => import("@/app/dashboard/profile"),
  settings: () => import("@/app/dashboard/settings"),
  
  // Communication modules
  announcements: () => import("@/app/dashboard/announcements"),
  chat: () => import("@/app/dashboard/chat"),
  notifications: () => import("@/app/dashboard/notifications"),
};

// ============================================================================
// IMAGE OPTIMIZATION
// ============================================================================

export interface ImageOptimizationConfig {
  quality: number; // 1-100
  format: "webp" | "jpeg" | "png";
  maxWidth: number;
  maxHeight: number;
}

export const IMAGE_OPTIMIZATION_PRESETS = {
  thumbnail: {
    quality: 60,
    format: "webp" as const,
    maxWidth: 200,
    maxHeight: 200,
  },
  avatar: {
    quality: 70,
    format: "webp" as const,
    maxWidth: 150,
    maxHeight: 150,
  },
  cardImage: {
    quality: 75,
    format: "webp" as const,
    maxWidth: 400,
    maxHeight: 300,
  },
  fullWidth: {
    quality: 80,
    format: "webp" as const,
    maxWidth: 1200,
    maxHeight: 800,
  },
};

export function getOptimizedImageUrl(
  originalUrl: string,
  preset: keyof typeof IMAGE_OPTIMIZATION_PRESETS
): string {
  if (!originalUrl) return "";

  const config = IMAGE_OPTIMIZATION_PRESETS[preset];
  const params = new URLSearchParams({
    q: config.quality.toString(),
    w: config.maxWidth.toString(),
    h: config.maxHeight.toString(),
    fm: config.format,
  });

  // In production, use a CDN like Cloudinary or imgix
  return `${originalUrl}?${params.toString()}`;
}

// ============================================================================
// REACT QUERY OPTIMIZATION
// ============================================================================

export const REACT_QUERY_CONFIG = {
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 2,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
};

// ============================================================================
// BUNDLE SIZE ANALYSIS
// ============================================================================

export interface BundleAnalysis {
  totalSize: number;
  chunks: Array<{
    name: string;
    size: number;
    percentage: number;
  }>;
  largestChunks: Array<{
    name: string;
    size: number;
  }>;
  recommendations: string[];
}

export function analyzeBundleSize(bundleStats: any): BundleAnalysis {
  const chunks = bundleStats.chunks || [];
  const totalSize = chunks.reduce((sum: number, chunk: any) => sum + (chunk.size || 0), 0);

  const largestChunks = chunks
    .sort((a: any, b: any) => (b.size || 0) - (a.size || 0))
    .slice(0, 5);

  const recommendations: string[] = [];

  if (totalSize > 500000) {
    recommendations.push("Bundle size exceeds 500KB. Consider code splitting.");
  }

  largestChunks.forEach((chunk: any) => {
    if ((chunk.size || 0) > 200000) {
      recommendations.push(`Chunk "${chunk.name}" exceeds 200KB. Consider lazy loading.`);
    }
  });

  return {
    totalSize,
    chunks: chunks.map((chunk: any) => ({
      name: chunk.name,
      size: chunk.size || 0,
      percentage: ((chunk.size || 0) / totalSize) * 100,
    })),
    largestChunks: largestChunks.map((chunk: any) => ({
      name: chunk.name,
      size: chunk.size || 0,
    })),
    recommendations,
  };
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics = {
    pageLoadTime: 0,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
    cumulativeLayoutShift: 0,
    timeToInteractive: 0,
    bundleSize: 0,
    cacheHitRate: 0,
  };

  private constructor() {
    this.initializeMetrics();
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private initializeMetrics(): void {
    if (typeof window === "undefined") return;

    // Measure page load time
    window.addEventListener("load", () => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      if (navigation) {
        this.metrics.pageLoadTime = navigation.loadEventEnd - navigation.loadEventStart;
      }
    });

    // Measure Web Vitals using PerformanceObserver
    if ("PerformanceObserver" in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === "first-contentful-paint") {
              this.metrics.firstContentfulPaint = entry.startTime;
            }
            if (entry.entryType === "largest-contentful-paint") {
              this.metrics.largestContentfulPaint = entry.startTime;
            }
            if (entry.entryType === "layout-shift") {
              this.metrics.cumulativeLayoutShift += (entry as any).value;
            }
          }
        });

        observer.observe({
          entryTypes: ["paint", "largest-contentful-paint", "layout-shift"],
        });
      } catch (e) {
        console.error("Performance monitoring error:", e);
      }
    }
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public reportMetrics(): void {
    console.log("Performance Metrics:", this.metrics);
    // In production, send to analytics service
  }
}

// ============================================================================
// EXPORT PERFORMANCE UTILITIES
// ============================================================================

export const cacheManager = CacheManager.getInstance();
export const performanceMonitor = PerformanceMonitor.getInstance();

export default {
  CacheManager,
  cacheManager,
  setupLazyLoading,
  lazyLoadImages,
  CODE_SPLIT_ROUTES,
  IMAGE_OPTIMIZATION_PRESETS,
  getOptimizedImageUrl,
  REACT_QUERY_CONFIG,
  analyzeBundleSize,
  PerformanceMonitor,
  performanceMonitor,
};
