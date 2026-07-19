export interface ThemeConfig {
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontSize: string;
  fontFamily: string;
}

export interface LayoutConfig {
  horizontalAlignment: 'left' | 'center' | 'right';
  verticalAlignment: 'top' | 'center' | 'bottom';
}

export interface BillboardItem {
  id: string;
  message: string;
  author: string;
  tags?: string[];
  accentColor?: string;
  /** Date de publication ISO 8601 — utilisée par les feeds, le sitemap et le JSON-LD. */
  date?: string;
}

export interface BillboardConfig {
  billboards: BillboardItem[];
  theme: ThemeConfig;
  layout: LayoutConfig;
}
