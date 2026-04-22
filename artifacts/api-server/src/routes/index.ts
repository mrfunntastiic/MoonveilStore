import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import categoriesRouter from "./categories";
import productsRouter from "./products";
import ordersRouter from "./orders";
import customersRouter from "./customers";
import botRouter from "./bot";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(categoriesRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(customersRouter);
router.use(botRouter);

export default router;
