import { apiClient } from '../client';
import { API } from '../endpoints';
import { resolveMediaUrl } from '@/lib/media';
import {
  Testimony,
  CommunityBlog,
  BlogComment,
  PaginatedResponse,
  ListParams,
} from '../types';

const normalizeBlog = (blog: any): CommunityBlog => ({
  ...blog,
  image: resolveMediaUrl(blog?.image) || blog?.image,
  video_url: resolveMediaUrl(blog?.video_url) || blog?.video_url,
  like_count: Number(blog?.like_count ?? 0),
  comment_count: Number(blog?.comment_count ?? 0),
  liked_by_me: Boolean(blog?.liked_by_me),
  comments: Array.isArray(blog?.comments) ? blog.comments : [],
  author: blog?.author
    ? {
        ...blog.author,
        avatar: resolveMediaUrl(blog.author.avatar) || blog.author.avatar,
      }
    : blog?.author,
});

export const communityService = {
  async getTestimonies(params?: ListParams): Promise<PaginatedResponse<Testimony>> {
    const { data } = await apiClient.get(API.COMMUNITY.TESTIMONIALS, { params });
    return data;
  },

  async getTestimony(id: string): Promise<Testimony> {
    const { data } = await apiClient.get(API.COMMUNITY.TESTIMONY_DETAIL(id));
    return data;
  },

  async getPendingTestimonies(params?: ListParams): Promise<PaginatedResponse<Testimony>> {
    const { data } = await apiClient.get(API.COMMUNITY.PENDING_TESTIMONIES, { params });
    return data;
  },

  async createTestimony(testimonyData: Partial<Testimony>): Promise<Testimony> {
    const { data } = await apiClient.post(API.COMMUNITY.TESTIMONIALS, testimonyData);
    return data;
  },

  async approveTestimony(idOrPayload: string | { id: string }): Promise<Testimony> {
    const id = typeof idOrPayload === 'string' ? idOrPayload : idOrPayload.id;
    const { data } = await apiClient.post(API.COMMUNITY.APPROVE_TESTIMONY(id), {});
    return data;
  },

  async rejectTestimony(
    idOrPayload: string | { id: string; reason?: string },
    reason?: string
  ): Promise<Testimony> {
    const id = typeof idOrPayload === 'string' ? idOrPayload : idOrPayload.id;
    const payloadReason = typeof idOrPayload === 'string' ? reason : idOrPayload.reason;
    const { data } = await apiClient.post(API.COMMUNITY.REJECT_TESTIMONY(id), { reason: payloadReason });
    return data;
  },

  async getBlogs(params?: ListParams): Promise<PaginatedResponse<CommunityBlog>> {
    const { data } = await apiClient.get(API.COMMUNITY.BLOGS, { params });
    return {
      ...data,
      results: (data?.results ?? []).map(normalizeBlog),
    };
  },

  async getBlog(idOrSlug: string): Promise<CommunityBlog> {
    const { data } = await apiClient.get(API.COMMUNITY.BLOG_DETAIL(idOrSlug));
    return normalizeBlog(data);
  },

  async createBlog(blogData: Partial<CommunityBlog>): Promise<CommunityBlog> {
    const { data } = await apiClient.post(API.COMMUNITY.BLOGS, blogData);
    return normalizeBlog(data);
  },

  async updateBlog(id: string, blogData: Partial<CommunityBlog>): Promise<CommunityBlog> {
    const { data } = await apiClient.patch(API.COMMUNITY.BLOG_DETAIL(id), blogData);
    return normalizeBlog(data);
  },

  async publishBlog(idOrPayload: string | { id: string }): Promise<CommunityBlog> {
    const id = typeof idOrPayload === 'string' ? idOrPayload : idOrPayload.id;
    const { data } = await apiClient.post(API.COMMUNITY.PUBLISH_BLOG(id), {});
    return normalizeBlog(data);
  },

  async viewBlog(id: string): Promise<CommunityBlog> {
    const { data } = await apiClient.post(API.COMMUNITY.VIEW_BLOG(id), {});
    return normalizeBlog(data);
  },

  async deleteBlog(id: string): Promise<void> {
    await apiClient.delete(API.COMMUNITY.BLOG_DETAIL(id));
  },

  async likeBlog(id: string): Promise<CommunityBlog> {
    const { data } = await apiClient.post(API.COMMUNITY.LIKE_BLOG(id), {});
    return normalizeBlog(data);
  },

  async unlikeBlog(id: string): Promise<CommunityBlog> {
    const { data } = await apiClient.post(API.COMMUNITY.UNLIKE_BLOG(id), {});
    return normalizeBlog(data);
  },

  async getComments(blogId: string, params?: ListParams): Promise<PaginatedResponse<BlogComment>> {
    const { data } = await apiClient.get(API.COMMUNITY.COMMENTS, {
      params: { ...params, blog: blogId },
    });
    return data;
  },

  async getBlogComments(blogId: string, params?: ListParams): Promise<PaginatedResponse<BlogComment>> {
    return this.getComments(blogId, params);
  },

  async getComment(id: string): Promise<BlogComment> {
    const { data } = await apiClient.get(API.COMMUNITY.COMMENT_DETAIL(id));
    return data;
  },

  async createComment(blogId: string, content: string): Promise<BlogComment> {
    const { data } = await apiClient.post(API.COMMUNITY.COMMENTS, {
      blog: blogId,
      content,
    });
    return data;
  },

  async createBlogComment(payload: { blog_id: string; content: string }): Promise<BlogComment> {
    return this.createComment(payload.blog_id, payload.content);
  },

  async deleteComment(id: string): Promise<void> {
    await apiClient.delete(API.COMMUNITY.COMMENT_DETAIL(id));
  },
};
