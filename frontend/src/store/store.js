import { configureStore } from "@reduxjs/toolkit"
import liveLocationReducer from "./liveLocationSlice.js"

export const store = configureStore({
  reducer: {
    liveLocation: liveLocationReducer,
  },
})
