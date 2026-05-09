import { createRouter, createWebHistory } from "vue-router"

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/overview",
    },
    {
      path: "/overview",
      component: () => import("../pages/OverviewPage.vue"),
    },
    {
      path: "/analysis",
      component: () => import("../pages/AnalysisPage.vue"),
    },
    {
      path: "/intelligence",
      component: () => import("../pages/IntelligencePage.vue"),
    },
    {
      path: "/history",
      component: () => import("../pages/HistoryPage.vue"),
    },
  ],
})
