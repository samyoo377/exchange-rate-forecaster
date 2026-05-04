import { createRouter, createWebHistory } from "vue-router"

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/overview" },
    {
      path: "/overview",
      name: "Overview",
      component: () => import("../pages/OverviewPage.vue"),
    },
    {
      path: "/cron",
      name: "CronJobs",
      component: () => import("../pages/CronJobsPage.vue"),
    },
    {
      path: "/database",
      name: "Database",
      component: () => import("../pages/DatabasePage.vue"),
    },
    {
      path: "/news-sources",
      name: "NewsSources",
      component: () => import("../pages/NewsSourcesPage.vue"),
    },
    {
      path: "/indicators",
      name: "IndicatorConfig",
      component: () => import("../pages/IndicatorConfigPage.vue"),
    },
    {
      path: "/assistant",
      name: "Assistant",
      component: () => import("../pages/AssistantPage.vue"),
    },
  ],
})
