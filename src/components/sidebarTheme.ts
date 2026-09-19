import { createContext } from 'react';

/** Which look the sidebar pieces (brand, nav groups/items) should render in.
 * Defaults to the dark-green sidebar; a workspace opts into 'light' by
 * wrapping its <aside> in <SidebarThemeContext.Provider value="light">. */
export type SidebarThemeName = 'dark' | 'light';
export const SidebarThemeContext = createContext<SidebarThemeName>('dark');

/** Shared surfaces for the light workspace look (all roles). */
export const LIGHT_SIDEBAR_SURFACE = 'bg-gradient-to-b from-[#def2ec] via-[#f4f3e8] to-[#e4eedd] border-r border-[#d9dccb] text-[#1f3b30]';
export const LIGHT_PAGE_SURFACE = 'bg-gradient-to-b from-[#eaf6f1] via-[#f7f6ec] to-[#eaf2e3]';
