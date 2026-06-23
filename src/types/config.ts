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
}

export interface BillboardConfig {
  billboards: BillboardItem[];
  theme: ThemeConfig;
  layout: LayoutConfig;
}
