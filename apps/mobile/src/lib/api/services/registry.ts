/**
 * App Registry — which apps this school has.
 *
 * The clients ask once on load and filter navigation by the answer. This is
 * presentation only: the same check runs server-side on every request through
 * the RequiresApp permission, so a hidden route is not a security boundary and
 * must never be treated as one.
 */

import { apiClient } from "../client";

export type AppTier = "core" | "included" | "standard" | "premium";

export type RegistryApp = {
  key: string;
  name: string;
  summary: string;
  icon: string;
  tier: AppTier;
  roles: string[];
  routes: string[];
  api_prefixes: string[];
  core_services: string[];
  owns_data: string[];
  price_hint: string;
  is_core: boolean;
  is_uninstallable: boolean;
};

export type MyApps = {
  installed_keys: string[];
  apps: RegistryApp[];
  routes: string[];
  is_platform_executive: boolean;
};

/** Catalogue annotated with one school's state — what the console renders. */
export type SchoolApp = RegistryApp & {
  installed: boolean;
  enabled: boolean;
  licence_expiry: string | null;
  expired: boolean;
  installed_at: string | null;
  note: string;
};

export type StoreApp = {
  key: string;
  name: string;
  summary: string;
  icon: string;
  icon_image: string;
  description: string;
  version: string;
  publisher: string;
  pricing: { model: string; interval: string; price: number; currency: string };
  installed: boolean;
  licence_expiry: string | null;
  expired: boolean;
  can_manage: boolean;
};

export const registryService = {
  /** Published apps a school can install for itself. */
  async store(): Promise<{ apps: StoreApp[]; can_manage: boolean }> {
    const { data } = await apiClient.get("/registry/store/");
    return data;
  },

  /** Install a published app for the caller's own school, for the chosen roles. */
  async storeInstall(appKey: string, roles: string[] = []): Promise<any> {
    try {
      const { data } = await apiClient.post(
        `/registry/store/${encodeURIComponent(appKey)}/install/`, { roles });
      return data;
    } catch (error: any) {
      // A paid app answers "payment required". Older servers send it as 402,
      // which axios throws; unwrap it so the payment form still opens instead
      // of the call looking like a plain failure.
      const body = error?.response?.data;
      if (error?.response?.status === 402 && body?.payment_required) {
        return body;
      }
      throw error;
    }
  },

  /** Remove an app from the caller's own school. */
  async storeUninstall(appKey: string): Promise<any> {
    const { data } = await apiClient.post(`/registry/store/${encodeURIComponent(appKey)}/uninstall/`);
    return data;
  },

  /** Start a mobile-money collection to buy a paid app for the school. */
  async buyApp(appKey: string, phone: string, roles: string[] = [], operator?: string): Promise<any> {
    const { data } = await apiClient.post("/fees/payunit/app-purchase/", {
      app_key: appKey, phone, roles, operator,
    });
    return data;
  },

  /** Read/set which schools may see and install an app (founders). */
  async getAudience(appKey: string): Promise<{ visible_to_all: boolean; school_ids: string[] }> {
    const { data } = await apiClient.get(`/registry/apps/${encodeURIComponent(appKey)}/audience/`);
    return data;
  },
  async setAudience(appKey: string, visibleToAll: boolean, schoolIds: string[]): Promise<any> {
    const { data } = await apiClient.post(`/registry/apps/${encodeURIComponent(appKey)}/audience/`, {
      visible_to_all: visibleToAll, school_ids: schoolIds,
    });
    return data;
  },

  /** Upload the app's icon image (founders). */
  async uploadIcon(appKey: string, file: File): Promise<{ icon_image: string }> {
    const form = new FormData();
    form.append("icon", file);
    const { data } = await apiClient.post(
      `/registry/apps/${encodeURIComponent(appKey)}/icon/`, form,
      { headers: { "Content-Type": "multipart/form-data" } });
    return data;
  },

  /** Read/set the app's full description (founders). */
  async getDetails(appKey: string): Promise<{ description: string }> {
    const { data } = await apiClient.get(`/registry/apps/${encodeURIComponent(appKey)}/details/`);
    return data;
  },
  async setDetails(appKey: string, description: string): Promise<any> {
    const { data } = await apiClient.post(`/registry/apps/${encodeURIComponent(appKey)}/details/`, { description });
    return data;
  },

  /** Poll a mobile-money transaction until it resolves. */
  async paymentStatus(transactionId: string): Promise<any> {
    const { data } = await apiClient.get(`/fees/payunit/status/${encodeURIComponent(transactionId)}/`);
    return data;
  },

  /** Apps available to the signed-in user's school. */
  async myApps(): Promise<MyApps> {
    const { data } = await apiClient.get("/registry/my-apps/");
    return data;
  },

  /** Every app in this release. Founders only. */
  async catalogue(): Promise<{ apps: RegistryApp[] }> {
    const { data } = await apiClient.get("/registry/catalogue/");
    return data;
  },

  /** One school's apps, with install state. Founders only. */
  async schoolApps(schoolId: string): Promise<{ apps: SchoolApp[] }> {
    const { data } = await apiClient.get(`/registry/schools/${schoolId}/apps/`);
    return data;
  },

  /** Install, uninstall, or change a licence expiry. Founders only. */
  async updateSchoolApp(
    schoolId: string,
    body: {
      app_key: string;
      action: "install" | "uninstall" | "set_expiry";
      licence_expiry?: string | null;
      note?: string;
    }
  ): Promise<{ apps: SchoolApp[] }> {
    const { data } = await apiClient.post(`/registry/schools/${schoolId}/apps/`, body);
    return data;
  },

  // ---- Uploaded apps (the Developer Console). Founders only. -------------

  /** Every uploaded build, newest first. */
  async builds(): Promise<{ builds: AppBuild[] }> {
    const { data } = await apiClient.get("/registry/builds/");
    return data;
  },

  /** Upload an .eia package. Creates a draft; nothing runs. */
  async uploadBuild(file: File): Promise<AppBuild> {
    const body = new FormData();
    body.append("package", file);
    const { data } = await apiClient.post("/registry/builds/upload/", body, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  /** Move a build through the lifecycle: submit | approve | reject | publish | pull. */
  async buildAction(
    buildId: string,
    action: "submit" | "approve" | "reject" | "publish" | "pull",
    note?: string
  ): Promise<AppBuild> {
    const { data } = await apiClient.post(`/registry/builds/${buildId}/${action}/`, {
      note: note || "",
    });
    return data;
  },

  /** Set how an app is charged for. Founder decision, no rebuild needed. */
  async setPricing(appKey: string, pricing: AppPricing): Promise<{ pricing: AppPricing }> {
    const { data } = await apiClient.post(`/registry/apps/${appKey}/pricing/`, pricing);
    return data;
  },
};

/** How an app is charged for. */
export type PricingModel = "free" | "one_time" | "subscription";
export type BillingInterval = "monthly" | "termly" | "yearly" | "";

export type AppPricing = {
  model: PricingModel;
  interval: BillingInterval;
  price: number;
  currency: string;
};

/** One uploaded build, as the Developer Console renders it. */
export type BuildState =
  | "draft" | "submitted" | "checks_failed" | "in_review"
  | "rejected" | "approved" | "published" | "deprecated" | "pulled";

export type AppBuild = {
  id: string;
  app_key: string;
  app_name: string;
  version: string;
  runtime_api: string;
  state: BuildState;
  state_label: string;
  changelog: string;
  size_bytes: number;
  check_report: { passed?: boolean; errors?: string[]; warnings?: string[] };
  review_note: string;
  submitted_by: string;
  reviewed_by: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  is_live: boolean;
  pricing?: AppPricing;
};

/**
 * Whether a dashboard route is available, given the routes the registry
 * returned.
 *
 * Unknown routes are allowed. Most dashboard pages belong to Core and are
 * never listed by an app, so defaulting to "hidden" would empty the sidebar.
 * Only routes an app actually claims are gated.
 */
export function isRouteAvailable(
  route: string,
  available: string[] | undefined,
  allClaimedRoutes: string[] | undefined
): boolean {
  if (!available || !allClaimedRoutes) return true;
  const claimed = allClaimedRoutes.includes(route);
  if (!claimed) return true;
  return available.includes(route);
}
