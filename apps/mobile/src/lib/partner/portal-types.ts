/**
 * Shape of GET /partners/me/ (backend/apps/partners/views.py portal_me).
 * Mobile/desktop only need to read a partner's own portal data; the full
 * partner client (login, session) lives on the website.
 */

export type ReferralStats = {
  code: string;
  link: string;
  clicks: number;
  leads: number;
  applications: number;
  approved_schools: number;
  active_schools: number;
  conversion_rate: number;
};

export type PortalData = {
  partner: {
    display_name: string;
    partner_type: string;
    status: string;
    is_public: boolean;
    public_name: string;
    public_description: string;
    public_website: string;
    logo_url: string;
    public_slug: string | null;
  };
  referral: ReferralStats;
  timeline: { month: string; schools: number }[];
  lifecycle: { stage: string; label: string; blurb: string; count: number }[];
  schools: {
    school_name: string;
    region: string;
    status: string;
    date: string;
    stage: string;
    stage_label: string;
    stage_blurb: string;
    step: number | null;
    total_steps: number;
    is_final: boolean;
    counts: boolean;
  }[];
};
