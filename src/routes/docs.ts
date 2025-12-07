import path from "path";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

const router = Router();
const swaggerPath = path.resolve(__dirname, "../../docs/swagger.yaml");
const swaggerDocument = YAML.load(swaggerPath);

router.use("/", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

export default router;
