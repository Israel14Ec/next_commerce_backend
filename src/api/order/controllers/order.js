'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const paypal = require('@paypal/checkout-server-sdk');

// Configuración del cliente de PayPal
function environment() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_SECRET_KEY;
  
  return new paypal.core.SandboxEnvironment(clientId, clientSecret);
}

function client() {
  return new paypal.core.PayPalHttpClient(environment());
}

function calcDiscountPrice(price, discount) {
  if (!discount || discount <= 0) return price;

  const discountAmount = (price * discount) / 100;
  return (price - discountAmount).toFixed(2);
}

module.exports = createCoreController('api::order.order', ({ strapi }) => ({
  // Custom endpoint
  async paymentOrder(ctx) {
    const { token, products, idUser, addressShopping } = ctx.request.body;

    let totalPayment = 0;
    products.forEach((product) => {
      const priceTemp = calcDiscountPrice(product.attributes.price, product.attributes.discount);
      totalPayment += Number(priceTemp) * product.quantity;
    });

    // Crear una orden en PayPal
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: "USD", // Cambia la moneda según tu necesidad
          value: totalPayment.toFixed(2)
        }
      }]
    });

    const order = await client().execute(request);

    // Preparar datos para guardar en la base de datos
    const data = {
      products,
      user: idUser,
      totalPayment,
      idPayment: order.result.id,
      addressShopping
    };

    // Validar los datos antes de guardarlos
    const model = strapi.contentType("api::order.order");
    const validData = await strapi.entityValidator.validateEntityCreation(model, data);

    // Guardar la entrada en la base de datos
    const entry = await strapi.db.query("api::order.order").create({ data: validData });

    // Devolver la entrada guardada
    return entry;
  }
}));
