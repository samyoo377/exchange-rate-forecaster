import { createRouter, createWebHistory } from "vue-router"

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/dashboard",
    },
    {
      path: "/dashboard",
      component: () => import("../pages/DashboardPage.vue"),
    },
    {
      path: "/history/predictions",
      component: () => import("../pages/PredictionHistoryPage.vue"),
    },
    {
      path: "/history/tasks",
      component: () => import("../pages/TaskHistoryPage.vue"),
    },
  ],
})
