import { LayoutDashboard, Activity, BarChart3, SlidersHorizontal } from 'lucide-react'

/* Route table for the top navigation.
   Kept out of TopBar.jsx deliberately: React Fast Refresh only preserves a
   module that exports ONLY components, so a component file exporting a plain
   constant alongside it breaks hot updates. That is how the globe kept
   disappearing until a hard reload — Globe3D exported a VIEWS object, the
   refresh bailed, and its lazy Suspense child never remounted. */
export const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/model-test', label: 'Model', icon: Activity },
  { to: '/comparisons', label: 'Comparisons', icon: BarChart3 },
  // Phase 2. The page is a roadmap, and the nav says so before you click.
  { to: '/scenarios', label: 'What-If', icon: SlidersHorizontal, soon: true },
]
