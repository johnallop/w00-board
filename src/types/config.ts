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

export interface BillboardConfig {
  message: string;
  author: string;
  tags?: string[];
  theme: ThemeConfig;
  layout: LayoutConfig;
}
