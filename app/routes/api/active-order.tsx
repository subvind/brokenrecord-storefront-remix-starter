import {
    addItemToOrder,
    adjustOrderLine,
    getActiveOrder,
    removeOrderLine,
    setCustomerForOrder,
    setOrderShippingAddress,
    setOrderShippingMethod,
} from '~/providers/orders/order';
import { DataFunctionArgs, json } from '@remix-run/server-runtime';
import {
    CreateAddressInput,
    CreateCustomerInput,
    ErrorResult,
    OrderDetailFragment,
} from '~/generated/graphql';
import { sessionStorage } from '~/sessions';
import { shippingFormDataIsValid } from '~/utils/validation';

export type CartLoaderData = Awaited<ReturnType<typeof loader>>;

export async function loader({ request }: DataFunctionArgs) {
    return {
        activeOrder: await getActiveOrder({ request }),
    };
}

export async function action({ request, params }: DataFunctionArgs) {
    const body = await request.formData();
    const formAction = body.get('action');
    let activeOrder: OrderDetailFragment | undefined = undefined;
    let error: ErrorResult | undefined;
    if (formAction === 'setCheckoutShipping') {
        if (shippingFormDataIsValid(body)) {
            const shippingFormData = Object.fromEntries<any>(
                body.entries(),
            ) as CreateAddressInput;
            const result = await setOrderShippingAddress(
                {
                    city: shippingFormData.city,
                    company: shippingFormData.company,
                    countryCode: shippingFormData.countryCode,
                    customFields: shippingFormData.customFields,
                    fullName: shippingFormData.fullName,
                    phoneNumber: shippingFormData.phoneNumber,
                    postalCode: shippingFormData.postalCode,
                    province: shippingFormData.province,
                    streetLine1: shippingFormData.streetLine1,
                    streetLine2: shippingFormData.streetLine2,
                },
                { request },
            );
            if (result.setOrderShippingAddress.__typename === 'Order') {
                activeOrder = result.setOrderShippingAddress;
            } else {
                error = result.setOrderShippingAddress;
            }
        }
    } else if (formAction === 'setOrderCustomer') {
        const customerData = Object.fromEntries<any>(
            body.entries(),
        ) as CreateCustomerInput;
        const result = await setCustomerForOrder(
            {
                emailAddress: customerData.emailAddress,
                firstName: customerData.firstName,
                lastName: customerData.lastName,
            },
            { request },
        );
        if (result.setCustomerForOrder.__typename === 'Order') {
            activeOrder = result.setCustomerForOrder;
        } else {
            error = result.setCustomerForOrder;
        }
    } else if (formAction === 'setShippingMethod') {
        const shippingMethodId = body.get('shippingMethodId');
        if (typeof shippingMethodId === 'string') {
            const result = await setOrderShippingMethod(shippingMethodId, {
                request,
            });
            if (result.setOrderShippingMethod.__typename === 'Order') {
                activeOrder = result.setOrderShippingMethod;
            } else {
                error = result.setOrderShippingMethod;
            }
        }
    } else if (formAction === 'removeItem') {
        const lineId = body.get('lineId');
        const result = await removeOrderLine(lineId?.toString() ?? '', {
            request,
        });
        if (result.removeOrderLine.__typename === 'Order') {
            activeOrder = result.removeOrderLine;
        } else {
            error = result.removeOrderLine;
        }
    } else if (formAction === 'adjustItem') {
        const lineId = body.get('lineId');
        const quantity = body.get('quantity');
        if (lineId && quantity != null) {
            const result = await adjustOrderLine(
                lineId?.toString(),
                +quantity,
                { request },
            );
            if (result.adjustOrderLine.__typename === 'Order') {
                activeOrder = result.adjustOrderLine;
            } else {
                error = result.adjustOrderLine;
            }
        }
    } else {
        // addItemToOrder
        const variantId = body.get('variantId')?.toString();
        const quantity = Number(body.get('quantity')?.toString() ?? 1);
        if (!variantId || !(quantity > 0)) {
            throw new Error(
                `Invalid input: variantId ${variantId}, quantity ${quantity}`,
            );
        }
        const result = await addItemToOrder(variantId, quantity, { request });
        if (result.addItemToOrder.__typename === 'Order') {
            activeOrder = result.addItemToOrder;
        } else {
            error = result.addItemToOrder;
        }
    }
    let headers: ResponseInit['headers'] = {};
    if (error) {
        const session = await sessionStorage.getSession(
            request?.headers.get('Cookie'),
        );
        session.flash('activeOrderError', error);
        headers = {
            'Set-Cookie': await sessionStorage.commitSession(session),
        };
    }
    return json(
        { activeOrder: activeOrder || (await getActiveOrder({ request })) },
        {
            headers,
        },
    );
}