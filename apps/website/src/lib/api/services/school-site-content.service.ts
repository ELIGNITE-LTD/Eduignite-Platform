import { apiClient } from "../client";

/**
 * Management API for a school website's blog and leadership
 * (backend/apps/school_site_content). Server-side permissions and tenant
 * isolation are the source of truth; the UI only mirrors them.
 */

const BASE = "/schools/public-site";

export type PostStatus = "draft" | "published" | "unpublished";

export interface BlogCategory {
  id: string;
  slug: string;
  name_en: string;
  name_fr: string;
  order: number;
  post_count: number;
}

export interface BlogPost {
  id: string;
  slug: string;
  status: PostStatus;
  title_en: string; title_fr: string;
  excerpt_en: string; excerpt_fr: string;
  body_en?: string; body_fr?: string;
  category: string | null;
  cover_image: string | null;
  cover_url: string | null;
  published_at: string | null;
  author_name: string;
  seo_title_en: string; seo_title_fr: string;
  seo_description_en: string; seo_description_fr: string;
  preview_token: string;
  created_at: string;
  updated_at: string;
  publish_blockers: Record<string, string>;
}

export type BlogPostInput = Partial<
  Pick<
    BlogPost,
    | "title_en" | "title_fr" | "excerpt_en" | "excerpt_fr" | "body_en" | "body_fr" | "slug"
    | "category" | "cover_image" | "seo_title_en" | "seo_title_fr" | "seo_description_en" | "seo_description_fr"
  >
>;

export type LeaderRole =
  | "principal" | "vice_principal" | "head_of_studies" | "discipline_master" | "bursar" | "other";

export interface LeaderCandidate {
  user: string;
  name: string;
  role: string;
  role_label: string;
  has_photo: boolean;
  directory_title: string;
  in_staff_directory: boolean;
  suggested_role_category: LeaderRole;
  already_added: boolean;
}

export interface Leader {
  id: string;
  user: string;
  name: string;
  role: string;
  role_label: string;
  has_photo: boolean;
  public_title_en: string; public_title_fr: string;
  role_category: LeaderRole;
  order: number;
  show_photo: boolean;
  bio_en: string; bio_fr: string;
  is_visible: boolean;
  photo: string | null;
}

export type LeaderInput = Partial<
  Pick<Leader, "public_title_en" | "public_title_fr" | "role_category" | "show_photo" | "bio_en" | "bio_fr" | "is_visible">
> & { user?: string };

export const schoolSiteContentService = {
  async listPosts(): Promise<BlogPost[]> {
    return (await apiClient.get(`${BASE}/blog/posts/`)).data.results;
  },
  async getPost(id: string): Promise<BlogPost> {
    return (await apiClient.get(`${BASE}/blog/posts/${id}/`)).data;
  },
  async createPost(input: BlogPostInput): Promise<BlogPost> {
    return (await apiClient.post(`${BASE}/blog/posts/`, input)).data;
  },
  async updatePost(id: string, input: BlogPostInput): Promise<BlogPost> {
    return (await apiClient.patch(`${BASE}/blog/posts/${id}/`, input)).data;
  },
  async deletePost(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/blog/posts/${id}/`);
  },
  async publishPost(id: string): Promise<BlogPost> {
    return (await apiClient.post(`${BASE}/blog/posts/${id}/publish/`)).data;
  },
  async unpublishPost(id: string): Promise<BlogPost> {
    return (await apiClient.post(`${BASE}/blog/posts/${id}/unpublish/`)).data;
  },
  async rotatePostPreview(id: string): Promise<BlogPost> {
    return (await apiClient.post(`${BASE}/blog/posts/${id}/preview-token/rotate/`)).data;
  },
  async uploadImage(file: File): Promise<{ id: string; url: string }> {
    const form = new FormData();
    form.append("file", file);
    return (await apiClient.post(`${BASE}/blog/images/`, form, { headers: { "Content-Type": "multipart/form-data" } })).data;
  },
  async listCategories(): Promise<BlogCategory[]> {
    return (await apiClient.get(`${BASE}/blog/categories/`)).data.results;
  },
  async saveCategory(input: { name_en: string; name_fr: string }, id?: string): Promise<BlogCategory> {
    return id
      ? (await apiClient.patch(`${BASE}/blog/categories/${id}/`, input)).data
      : (await apiClient.post(`${BASE}/blog/categories/`, input)).data;
  },
  async deleteCategory(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/blog/categories/${id}/`);
  },

  async leaderCandidates(): Promise<LeaderCandidate[]> {
    return (await apiClient.get(`${BASE}/leadership/candidates/`)).data.results;
  },
  async listLeaders(): Promise<Leader[]> {
    return (await apiClient.get(`${BASE}/leadership/`)).data.results;
  },
  async addLeader(input: LeaderInput): Promise<Leader> {
    return (await apiClient.post(`${BASE}/leadership/`, input)).data;
  },
  async updateLeader(id: string, input: LeaderInput): Promise<Leader> {
    return (await apiClient.patch(`${BASE}/leadership/${id}/`, input)).data;
  },
  async removeLeader(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/leadership/${id}/`);
  },
  async reorderLeaders(ids: string[]): Promise<Leader[]> {
    return (await apiClient.post(`${BASE}/leadership/reorder/`, { ids })).data.results;
  },
};
