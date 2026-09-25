import { createContext, useContext } from 'react'

/* Kept out of Tour.jsx: a component module that also exports a hook breaks
   React Fast Refresh for that file. */
export const TourContext = createContext({ start: () => {}, active: false })
export const useTour = () => useContext(TourContext)
