// ====== DOM ELEMENTS ======
const loginPage = document.getElementById('login-page');
const signupPage = document.getElementById('signup-page');
const showSignupLink = document.getElementById('show-signup');
const showLoginLink = document.getElementById('show-login');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const resetPasswordSection = document.getElementById('reset-password-section');
const forgotPasswordLinks = document.querySelectorAll('.forgot-password-link');
const backToLoginBtn = document.getElementById('back-to-login');
const successModal = document.getElementById('success-modal');
const resetSuccessModal = document.getElementById('reset-success-modal');

// Feedback System DOM Elements
const marqueeBtn = document.getElementById('feedbackBtnMarquee');
const feedbackModal = document.getElementById('feedbackModal');
const closeModalBtn = document.getElementById('closeModal');
const feedbackForm = document.getElementById('feedbackForm');
const feedbackSuccess = document.getElementById('feedbackSuccess');
const closeSuccessBtn = document.getElementById('closeSuccess');
const messageTextarea = document.getElementById('message');
const charCount = document.getElementById('charCount');
const ratingButtons = document.querySelectorAll('.rating-btn');
const ratingInput = document.getElementById('rating');
const feedbackType = document.getElementById('feedbackType');
const submitBtn = document.getElementById('submitFeedback');

// ====== STATE MANAGEMENT ======
let currentTab = 'username';
let resetStep = 1;
let otpTimer = null;
let otpTimeLeft = 120;
let generatedOTP = '';
let resetIdentifier = '';
let isProcessingOrder = false;

// track order id across payment flow so QR and confirmation match
let currentOrderId = null;

// Store coordinates for delivery charge calculation
let storeCoordinates = {
    lat: 12.9716,   // Default store latitude (Bangalore)
    lng: 77.5946    // Default store longitude (Bangalore)
};
let customerCoordinates = null;
let deliveryCharge = 0;

// helper for creating/returning a consistent order id during one checkout session
function ensureOrderId() {
    if (!currentOrderId) {
        currentOrderId = 'OM' + Date.now().toString().slice(-6);
    }
    return currentOrderId;
}

// set the order id text in all known places (UPI panel, confirmation, summaries)
function displayOrderId(id) {
    if (!id) return;
    const selectors = [
        '#order-id',
        '.order-id',
        '.order-value',
        'span.order-value'
    ];
    selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            el.textContent = id;
        });
    });
}

// ====== DELIVERY CHARGE CALCULATION ======
// Haversine formula to calculate distance between two coordinates in KM
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Calculate delivery charge based on distance (in KM)
function calculateDeliveryCharge(distanceKm) {
    if (distanceKm <= 3) {
        return 40;
    } else if (distanceKm <= 5) {
        return 80;
    } else {
        return Math.ceil(distanceKm * 10);
    }
}

// Geocode address using Google Maps Geocoding API
async function geocodeAddress(address) {
    const apiKey = 'YOUR_GOOGLE_MAPS_API_KEY'; // Replace with your actual API key
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'OK' && data.results.length > 0) {
            const location = data.results[0].geometry.location;
            return {
                lat: location.lat,
                lng: location.lng,
                formattedAddress: data.results[0].formatted_address
            };
        } else {
            console.error('Geocoding failed:', data.status);
            return null;
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
}

// Update delivery charge based on customer address
async function updateDeliveryChargeFromAddress(addressString) {
    if (!addressString) return;
    
    // Show loading indicator
    const deliveryElement = document.getElementById('checkout-delivery');
    if (deliveryElement) {
        deliveryElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating...';
    }
    
    const coordinates = await geocodeAddress(addressString);
    
    if (coordinates) {
        customerCoordinates = coordinates;
        const distance = calculateDistance(storeCoordinates.lat, storeCoordinates.lng, coordinates.lat, coordinates.lng);
        deliveryCharge = calculateDeliveryCharge(distance);
        
        console.log(`Distance: ${distance.toFixed(2)} km, Delivery Charge: ₹${deliveryCharge}`);
        
        // Update all delivery charge displays
        updateAllDeliveryDisplays(deliveryCharge);
        
        // Store the distance for reference
        window.lastCalculatedDistance = distance;
        
        return deliveryCharge;
    } else {
        // Fallback to default delivery charge
        deliveryCharge = 50;
        updateAllDeliveryDisplays(deliveryCharge);
        console.warn('Geocoding failed, using default delivery charge');
        return deliveryCharge;
    }
}

// Update all delivery charge displays across the application
function updateAllDeliveryDisplays(charge) {
    // Update checkout page delivery
    const checkoutDelivery = document.getElementById('checkout-delivery');
    if (checkoutDelivery) {
        checkoutDelivery.textContent = charge === 0 ? 'Free' : `₹${charge}`;
    }
    
    // Update cart page delivery
    const cartDelivery = document.getElementById('cart-delivery');
    if (cartDelivery) {
        cartDelivery.textContent = charge === 0 ? 'Free' : `₹${charge}`;
    }
    
    // Update order summary in checkout
    const summaryDelivery = document.querySelector('.checkout-summary .summary-item span:last-child');
    if (summaryDelivery && summaryDelivery.closest('.summary-item')?.querySelector('span:first-child')?.textContent === 'Delivery') {
        summaryDelivery.textContent = charge === 0 ? 'Free' : `₹${charge}`;
    }
    
    // Update cart totals
    updateCartTotalsWithDelivery(charge);
}

// Update cart totals with new delivery charge
function updateCartTotalsWithDelivery(charge) {
    const totals = calculateCartTotals();
    totals.delivery = charge;
    const total = totals.subtotal + charge + totals.tax;
    
    // Update cart summary
    const cartTotalElement = document.getElementById('cart-total');
    if (cartTotalElement) {
        cartTotalElement.textContent = `₹${total.toFixed(2)}`;
    }
    
    // Update checkout summary
    const checkoutTotalElement = document.getElementById('checkout-total');
    if (checkoutTotalElement) {
        checkoutTotalElement.textContent = `₹${total.toFixed(2)}`;
    }
}

// Listen for address selection/input changes
function setupDeliveryChargeListener() {
    // Listen for saved address selection in checkout
    const savedAddressesList = document.getElementById('saved-addresses-list');
    if (savedAddressesList) {
        savedAddressesList.addEventListener('change', async function(e) {
            if (e.target && e.target.type === 'radio') {
                const addressId = e.target.value;
                if (addressId !== 'new') {
                    const address = window.userData?.addresses?.find(addr => addr.id == addressId);
                    if (address) {
                        const fullAddress = `${address.street}, ${address.city}, ${address.state} - ${address.pincode}`;
                        await updateDeliveryChargeFromAddress(fullAddress);
                        updateCheckoutSummary();
                    }
                }
            }
        });
    }
    
    // Listen for new address form submission
    const saveAddressBtn = document.getElementById('save-address-btn');
    if (saveAddressBtn) {
        saveAddressBtn.addEventListener('click', async function() {
            setTimeout(async () => {
                const street = document.getElementById('delivery-address')?.value;
                const city = document.getElementById('delivery-city')?.value;
                const state = document.getElementById('delivery-state')?.value;
                const pincode = document.getElementById('delivery-pincode')?.value;
                
                if (street && city && state && pincode) {
                    const fullAddress = `${street}, ${city}, ${state} - ${pincode}`;
                    await updateDeliveryChargeFromAddress(fullAddress);
                    updateCheckoutSummary();
                }
            }, 100);
        });
    }
    
    // Listen for manual address entry (if user types address)
    const addressInput = document.getElementById('delivery-address');
    if (addressInput) {
        let debounceTimer;
        addressInput.addEventListener('blur', async function() {
            const city = document.getElementById('delivery-city')?.value;
            const state = document.getElementById('delivery-state')?.value;
            const pincode = document.getElementById('delivery-pincode')?.value;
            
            if (this.value && city && state && pincode) {
                const fullAddress = `${this.value}, ${city}, ${state} - ${pincode}`;
                await updateDeliveryChargeFromAddress(fullAddress);
                updateCheckoutSummary();
            }
        });
    }
}

// Override calculateCartTotals to use dynamic delivery charge
const originalCalculateCartTotals = calculateCartTotals;
function calculateCartTotals() {
    if (!window.userData?.cart || window.userData.cart.length === 0) {
        return {
            subtotal: 0,
            delivery: 0,
            tax: 0,
            couponDiscount: 0,
            total: 0
        };
    }
    
    const subtotal = window.userData.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    // Use dynamic delivery charge instead of static calculation
    const delivery = deliveryCharge > 0 ? deliveryCharge : (subtotal > 499 ? 0 : 50);
    const tax = subtotal * 0.05;
    
    let couponDiscount = 0;
    if (window.activeCoupon) {
        const coupon = window.couponDatabase?.[window.activeCoupon.code];
        if (coupon) {
            if (coupon.type === 'percentage') {
                couponDiscount = Math.min((subtotal * coupon.discount) / 100, coupon.maxDiscount);
            } else if (coupon.type === 'fixed') {
                couponDiscount = Math.min(coupon.discount, coupon.maxDiscount);
            } else if (coupon.type === 'shipping') {
                couponDiscount = delivery;
            }
        }
    }
    
    const total = Math.max(0, subtotal + delivery + tax - couponDiscount);
    
    return {
        subtotal,
        delivery,
        tax,
        couponDiscount,
        total
    };
}

// ====== INITIALIZATION ======
document.addEventListener('DOMContentLoaded', function() {
    initializeTabs();
    initializePasswordToggles();
    initializeOTPInputs();
    attachEventListeners();
    checkRememberedUser();
    initializeAddressEvents();
    setupDeliveryChargeListener(); // Initialize delivery charge listener
    
    // ===== PAGE MANAGEMENT =====
    const pages = {
        login: document.getElementById('login-page'),
        signup: document.getElementById('signup-page'),
        products: document.getElementById('products-page'),
        profile: document.getElementById('profile-page'),
        cart: document.getElementById('cart-page'),
        checkout: document.getElementById('checkout-page'),
        confirmation: document.getElementById('confirmation-page')
    };

    // User Data
    let userData = {
        isLoggedIn: false,
        name: '',
        email: '',
        phone: '',
        addresses: [],
        orders: [],
        wishlist: [],
        cart: []
    };
    
    // Make userData accessible globally
    window.userData = userData;
    
    // Sample addresses
    const sampleAddresses = {
        home: {
            id: 1,
            name: 'Home',
            fullName: 'John Doe',
            phone: '9876543210',
            street: '123 Green Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            default: true
        },
        office: {
            id: 2,
            name: 'Office',
            fullName: 'John Doe',
            phone: '9876543211',
            street: '456 Business Park',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400002',
            default: false
        }
    };
    
    // ===== PRODUCT DATABASE - ALL 48 PRODUCTS =====
    const productDatabase = {
        // Fruits (1-16)
        1: { 
            name: "Organic Shimla Apples",
            category: "Fruits",
            originalPrice: 249,
            discount: 20,
            prices: {
                1: 199,  // 500g
                2: 398,  // 1kg
                3: 597,  // 1.5kg
                4: 796,  // 2kg
                5: 995   // 2.5kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "1.5kg",
                4: "2kg",
                5: "2.5kg"
            },
            image: "https://w0.peakpx.com/wallpaper/182/615/HD-wallpaper-fruits-apple-fruit.jpg",
            description: "Crisp and juicy organic apples from Shimla hills",
            rating: 4.5,
            reviews: 128,
            stock: 50,
            organicCertified: true
        },
        2: { 
            name: "Organic Bananas",
            category: "Fruits",
            originalPrice: 79,
            discount: 25,
            prices: {
                1: 59,   // 9 pcs
                2: 99,   // 15 pcs
                3: 132,  // 20 pcs
                4: 79,   // 12 pcs
                5: 158   // 24 pcs
            },
            weight: {
                1: "9 pcs",
                2: "15 pcs",
                3: "20 pcs",
                4: "12 pcs",
                5: "24 pcs"
            },
            image: "https://png.pngtree.com/thumb_back/fh260/background/20220319/pngtree-a-hanging-banana-hd-photography-material-image_1022466.jpg",
            description: "Naturally ripened organic bananas",
            rating: 4.3,
            reviews: 95,
            stock: 100,
            organicCertified: true
        },
        3: { 
            name: "Organic Mangoes",
            category: "Fruits",
            originalPrice: 599,
            discount: 17,
            prices: {
                1: 499,  // 500g
                2: 998,  // 1kg
                3: 1497, // 1.5kg
                4: 1996, // 2kg
                5: 2495  // 2.5kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "1.5kg",
                4: "2kg",
                5: "2.5kg"
            },
            image: "https://wallpapers.com/images/featured/mango-evb0z302mlfebdo0.jpg",
            description: "Sweet Alphonso mangoes, organic farming",
            rating: 4.7,
            reviews: 210,
            stock: 30,
            organicCertified: true,
            seasonal: true
        },
        4: { 
            name: "Organic Pomegranate",
            category: "Fruits",
            originalPrice: 149,
            discount: 13,
            prices: {
                1: 129,  // 250g
                2: 258,  // 500g
                3: 516,  // 1kg
                4: 774,  // 1.5kg
                5: 1032  // 2kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "1kg",
                4: "1.5kg",
                5: "2kg"
            },
            image: "https://t3.ftcdn.net/jpg/04/32/47/36/360_F_432473688_NBFaMH9L7Ls0kvAxnCZnRlvbCaSgxozB.jpg",
            description: "Ruby red pomegranate seeds, antioxidant rich",
            rating: 4.4,
            reviews: 87,
            stock: 45,
            organicCertified: true
        },
        5: { 
            name: "Organic Oranges",
            category: "Fruits",
            originalPrice: 179,
            discount: 17,
            prices: {
                1: 149,  // 250g
                2: 298,  // 500g
                3: 596,  // 1kg
                4: 894,  // 1.5kg
                5: 1192  // 2kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "1kg",
                4: "1.5kg",
                5: "2kg"
            },
            image: "https://t4.ftcdn.net/jpg/02/79/60/69/360_F_279606999_4fItjv1RGj7ogujzQSZqB9hfkbyzxJ4r.jpg",
            description: "Juicy Nagpur oranges, Vitamin C rich",
            rating: 4.6,
            reviews: 142,
            stock: 60,
            organicCertified: true
        },
        6: { 
            name: "Organic Mosambi",
            category: "Fruits",
            originalPrice: 139,
            discount: 14,
            prices: {
                1: 119,  // 500g
                2: 238,  // 1kg
                3: 357,  // 1.5kg
                4: 476,  // 2kg
                5: 595   // 2.5kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "1.5kg",
                4: "2kg",
                5: "2.5kg"
            },
            image: "https://cmsimages.timesgroup.com/image-resizer/Bombaytimes?s3_path=Bombaytimes/posts/1745396124283/assets/images/aFzqTg3LA.png&format=webp",
            description: "Sweet lime, perfect for juices",
            rating: 4.2,
            reviews: 76,
            stock: 55,
            organicCertified: true
        },
        7: { 
            name: "Organic Lemons",
            category: "Fruits",
            originalPrice: 79,
            discount: 25,
            prices: {
                1: 59,   // 250g
                2: 118,  // 500g
                3: 177,  // 750g
                4: 236,  // 1kg
                5: 295   // 1.25kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "750g",
                4: "1kg",
                5: "1.25kg"
            },
            image: "https://www.commodityonline.com/leads/2024/02/1676436444_63ec63dc8dda9_2.webp",
            description: "Fresh organic lemons, pesticide-free",
            rating: 4.8,
            reviews: 203,
            stock: 80,
            organicCertified: true
        },
        8: { 
            name: "Organic Black Grapes",
            category: "Fruits",
            originalPrice: 199,
            discount: 10,
            prices: {
                1: 179,  // 500g
                2: 358,  // 1kg
                3: 537,  // 1.5kg
                4: 716,  // 2kg
                5: 895   // 2.5kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "1.5kg",
                4: "2kg",
                5: "2.5kg"
            },
            image: "https://images.healthshots.com/healthshots/en/uploads/2022/01/18163418/black-grapes.jpg",
            description: "Seedless black grapes, rich in antioxidants",
            rating: 4.5,
            reviews: 91,
            stock: 40,
            organicCertified: true
        },
        9: { 
            name: "Organic Watermelon",
            category: "Fruits",
            originalPrice: 129,
            discount: 23,
            prices: {
                1: 99,   // 3kg
                2: 198,  // 6kg
                3: 297,  // 9kg
                4: 396   // 12kg
            },
            weight: {
                1: "3kg",
                2: "6kg",
                3: "9kg",
                4: "12kg"
            },
            image: "https://watermark.lovepik.com/photo/20211210/large/lovepik-watermelon-for-summer-picture_501768493.jpg",
            description: "Sweet and hydrating watermelon",
            rating: 4.7,
            reviews: 134,
            stock: 25,
            organicCertified: true,
            seasonal: true
        },
        10: { 
            name: "Organic Muskmelon",
            category: "Fruits",
            originalPrice: 109,
            discount: 18,
            prices: {
                1: 89,   // 1.5kg
                2: 178,  // 3kg
                3: 267,  // 4.5kg
                4: 356   // 6kg
            },
            weight: {
                1: "1.5kg",
                2: "3kg",
                3: "4.5kg",
                4: "6kg"
            },
            image: "https://t3.ftcdn.net/jpg/08/56/30/38/360_F_856303873_lysQgpwr108YHHHyEeiGepwZ2Jmg5doG.jpg",
            description: "Aromatic muskmelon, naturally sweet",
            rating: 4.4,
            reviews: 68,
            stock: 35,
            organicCertified: true
        },
        11: { 
            name: "Organic Papaya",
            category: "Fruits",
            originalPrice: 99,
            discount: 20,
            prices: {
                1: 79,   // 1kg
                2: 158,  // 2kg
                3: 237,  // 3kg
                4: 316   // 4kg
            },
            weight: {
                1: "1kg",
                2: "2kg",
                3: "3kg",
                4: "4kg"
            },
            image: "https://media.istockphoto.com/id/1163930184/photo/papaya-on-wooden-background.jpg?s=612x612&w=0&k=20&c=W-1l2k1J8raJGvUb1NM0oeqEdC2DqRbt-2gpzfXL01o=",
            description: "Ripe papaya, digestive aid",
            rating: 4.3,
            reviews: 57,
            stock: 30,
            organicCertified: true
        },
        12: { 
            name: "Organic Pineapple",
            category: "Fruits",
            originalPrice: 89,
            discount: 22,
            prices: {
                1: 69,   // 1.2kg
                2: 138,  // 2.4kg
                3: 207,  // 3.6kg
                4: 276   // 4.8kg
            },
            weight: {
                1: "1.2kg",
                2: "2.4kg",
                3: "3.6kg",
                4: "4.8kg"
            },
            image: "https://cdn.pixabay.com/photo/2018/11/11/15/42/pineapple-3808963_640.jpg",
            description: "Tropical pineapple, enzyme rich",
            rating: 4.6,
            reviews: 89,
            stock: 28,
            organicCertified: true
        },
        13: { 
            name: "Organic Guava",
            category: "Fruits",
            originalPrice: 109,
            discount: 18,
            prices: {
                1: 89,   // 500g
                2: 178,  // 1kg
                3: 267,  // 1.5kg
                4: 356   // 2kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "1.5kg",
                4: "2kg"
            },
            image: "https://images.unsplash.com/photo-1689996647099-a7a0b67fd2f6?fm=jpg&q=60&w=3000&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8N3x8Z3VhdmF8ZW58MHx8MHx8fDA%3D",
            description: "Vitamin C rich guava, fresh harvest",
            rating: 4.4,
            reviews: 73,
            stock: 42,
            organicCertified: true
        },
        14: { 
            name: "Organic Coconut",
            category: "Fruits",
            originalPrice: 149,
            discount: 13,
            prices: {
                1: 129,  // 1 litre
                2: 258,  // 2 litres
                3: 387,  // 3 litres
                4: 516   // 4 litres
            },
            weight: {
                1: "1 litre",
                2: "2 litres",
                3: "3 litres",
                4: "4 litres"
            },
            image: "https://media.istockphoto.com/id/1407981572/photo/coconut-tree-at-coconut-farm.jpg?s=612x612&w=0&k=20&c=Mheo-LyMZpWcIVGl2Awh-8aK-MNgGTJuH78v4ChvfG0=",
            description: "Fresh tender coconut water",
            rating: 4.8,
            reviews: 156,
            stock: 50,
            organicCertified: true
        },
        15: { 
            name: "Organic Green Grapes",
            category: "Fruits",
            originalPrice: 199,
            discount: 15,
            prices: {
                1: 169,  // 500g
                2: 338,  // 1kg
                3: 507,  // 1.5kg
                4: 676   // 2kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "1.5kg",
                4: "2kg"
            },
            image: "https://png.pngtree.com/thumb_back/fh260/background/20210827/pngtree-grapes-on-the-table-with-green-grapes-background-image_764501.jpg",
            description: "Seedless green grapes, sweet and tart",
            rating: 4.5,
            reviews: 94,
            stock: 38,
            organicCertified: true
        },
        16: { 
            name: "Organic Cherry",
            category: "Fruits",
            originalPrice: 249,
            discount: 20,
            prices: {
                1: 199,  // 250g
                2: 398,  // 500g
                3: 597,  // 750g
                4: 796   // 1kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "750g",
                4: "1kg"
            },
            image: "https://cdn.pixabay.com/photo/2017/07/30/13/35/cherry-2554364_1280.jpg",
            description: "Imported cherries, antioxidant rich",
            rating: 4.9,
            reviews: 187,
            stock: 20,
            organicCertified: true,
            imported: true
        },

        // Vegetables (17-36)
        17: { 
            name: "Organic Potatoes",
            category: "Vegetables",
            originalPrice: 49,
            discount: 20,
            prices: {
                1: 39,   // 500g
                2: 78,   // 1kg
                3: 156,  // 2kg
                4: 234,  // 3kg
                5: 390   // 5kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "2kg",
                4: "3kg",
                5: "5kg"
            },
            image: "https://thumbs.dreamstime.com/b/potatoes-fresh-wooden-basket-33186647.jpg",
            description: "Fresh organic potatoes, farm to table",
            rating: 4.4,
            reviews: 234,
            stock: 150,
            organicCertified: true
        },
        18: { 
            name: "Organic Onions",
            category: "Vegetables",
            originalPrice: 45,
            discount: 22,
            prices: {
                1: 35,   // 500g
                2: 70,   // 1kg
                3: 140,  // 2kg
                4: 210,  // 3kg
                5: 350   // 5kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "2kg",
                4: "3kg",
                5: "5kg"
            },
            image: "https://zamaorganics.com/cdn/shop/files/madras_onion_1000_x_1000_px_1_1.png?v=1752752494",
            description: "Pungent organic onions, natural farming",
            rating: 4.3,
            reviews: 189,
            stock: 120,
            organicCertified: true
        },
        19: { 
            name: "Organic Carrots",
            category: "Vegetables",
            originalPrice: 79,
            discount: 25,
            prices: {
                1: 59,   // 250g
                2: 118,  // 500g
                3: 236,  // 1kg
                4: 472   // 2kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "1kg",
                4: "2kg"
            },
            image: "https://media.istockphoto.com/id/185275579/photo/bundles-of-organic-carrots-with-the-stems-still-attached.jpg?s=612x612&w=0&k=20&c=OIdIDUtDF9jxpCFnZlb7ld5tOj8pDMol1XIcfsHFlEk=",
            description: "Sweet organic carrots, beta-carotene rich",
            rating: 4.6,
            reviews: 167,
            stock: 85,
            organicCertified: true
        },
        20: { 
            name: "Organic Tomatoes",
            category: "Vegetables",
            originalPrice: 69,
            discount: 29,
            prices: {
                1: 49,   // 500g
                2: 98,   // 1kg
                3: 196,  // 2kg
                4: 294   // 3kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "2kg",
                4: "3kg"
            },
            image: "https://images.pexels.com/photos/1327838/pexels-photo-1327838.jpeg",
            description: "Juicy organic tomatoes, vine ripened",
            rating: 4.5,
            reviews: 278,
            stock: 95,
            organicCertified: true
        },
        21: { 
            name: "Organic Lady Finger",
            category: "Vegetables",
            originalPrice: 49,
            discount: 20,
            prices: {
                1: 39,   // 250g
                2: 78,   // 500g
                3: 156,  // 1kg
                4: 312   // 2kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "1kg",
                4: "2kg"
            },
            image: "https://t4.ftcdn.net/jpg/16/99/86/99/360_F_1699869971_B5XRbdUSJMM2Yrbk4WI6LzaQ2nNQ4ASr.jpg",
            description: "Tender okra, fiber rich",
            rating: 4.2,
            reviews: 89,
            stock: 65,
            organicCertified: true
        },
        22: { 
            name: "Organic Brinjal",
            category: "Vegetables",
            originalPrice: 39,
            discount: 26,
            prices: {
                1: 29,   // 250g
                2: 58,   // 500g
                3: 116,  // 1kg
                4: 232   // 2kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "1kg",
                4: "2kg"
            },
            image: "https://www.jiomart.com/images/product/original/590000166/brinjal-round-green-250-g-product-images-o590000166-p590000166-0-202412031731.jpg?im=Resize=(1000,1000)",
            description: "Purple brinjal, antioxidant properties",
            rating: 4.3,
            reviews: 76,
            stock: 55,
            organicCertified: true
        },
        23: { 
            name: "Organic Coriander",
            category: "Vegetables",
            originalPrice: 29,
            discount: 34,
            prices: {
                1: 19,   // 100g
                2: 38,   // 200g
                3: 95,   // 500g
                4: 190   // 1kg
            },
            weight: {
                1: "100g",
                2: "200g",
                3: "500g",
                4: "1kg"
            },
            image: "https://media.istockphoto.com/id/1133790325/photo/fresh-coriander-cilantro-leaves-on-basket.jpg?s=612x612&w=0&k=20&c=9wiu9r3LdvFeGfv9GApYCGmt_mRpnzHQFJmSXFgjbgo=",
            description: "Fresh coriander leaves, aromatic",
            rating: 4.7,
            reviews: 145,
            stock: 100,
            organicCertified: true
        },
        24: { 
            name: "Organic Garlic",
            category: "Vegetables",
            originalPrice: 35,
            discount: 29,
            prices: {
                1: 25,   // 100g
                2: 62,   // 250g
                3: 124,  // 500g
                4: 248   // 1kg
            },
            weight: {
                1: "100g",
                2: "250g",
                3: "500g",
                4: "1kg"
            },
            image: "https://connect.healthkart.com/wp-content/uploads/2016/12/Banner-2021-05-05T174631.491.jpg",
            description: "Pungent garlic, natural antibiotic",
            rating: 4.6,
            reviews: 132,
            stock: 75,
            organicCertified: true
        },
        25: { 
            name: "Organic Bottle Gourd",
            category: "Vegetables",
            originalPrice: 49,
            discount: 20,
            prices: {
                1: 39,   // 1 pc (500g)
                2: 78,   // 2 pcs (1kg)
                3: 117,  // 3 pcs (1.5kg)
                4: 156   // 4 pcs (2kg)
            },
            weight: {
                1: "1 pc (approx. 500g)",
                2: "2 pcs (approx. 1kg)",
                3: "3 pcs (approx. 1.5kg)",
                4: "4 pcs (approx. 2kg)"
            },
            image: "https://media.istockphoto.com/id/1194258667/photo/bottle-gourd-for-sale-in-market.jpg?s=612x612&w=0&k=20&c=sNSrJ3u5V4Q83pctJnz4qBNw751nxw5tE2d57RNv_Hs=",
            description: "Fresh bottle gourd, cooling vegetable",
            rating: 4.1,
            reviews: 67,
            stock: 45,
            organicCertified: true
        },
        26: { 
            name: "Organic Bitter Gourd",
            category: "Vegetables",
            originalPrice: 59,
            discount: 17,
            prices: {
                1: 49,   // 250g
                2: 98,   // 500g
                3: 196,  // 1kg
                4: 392   // 2kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "1kg",
                4: "2kg"
            },
            image: "https://media.istockphoto.com/id/472402096/photo/top-view-of-green-bitter-gourds-in-the-basket.jpg?s=612x612&w=0&k=20&c=n7Ua0o7X4Qe_FSfl38ufHIPslxofgkyNpa2Z2NXmBfM=",
            description: "Bitter gourd, blood sugar regulation",
            rating: 4.0,
            reviews: 54,
            stock: 40,
            organicCertified: true
        },
        27: { 
            name: "Organic Pumpkin",
            category: "Vegetables",
            originalPrice: 69,
            discount: 14,
            prices: {
                1: 59,   // 500g
                2: 118,  // 1kg
                3: 236,  // 2kg
                4: 354   // 3kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "2kg",
                4: "3kg"
            },
            image: "https://images.unsplash.com/photo-1506917728037-b6af01a7d403?fm=jpg&q=60&w=3000&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8cHVtcGtpbnxlbnwwfHwwfHx8MA%3D%3D",
            description: "Sweet pumpkin, Vitamin A rich",
            rating: 4.3,
            reviews: 78,
            stock: 50,
            organicCertified: true
        },
        28: { 
            name: "Organic Ridge Gourd",
            category: "Vegetables",
            originalPrice: 55,
            discount: 18,
            prices: {
                1: 45,   // 250g
                2: 90,   // 500g
                3: 180,  // 1kg
                4: 360   // 2kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "1kg",
                4: "2kg"
            },
            image: "https://media.istockphoto.com/id/606014430/photo/fresh-angled-loofah-angled-gourd-fruit.jpg?s=612x612&w=0&k=20&c=tdw10kSKaCiV2HXn5m39P-oVFwi-MZxDRfnzLynK0kw=",
            description: "Ridge gourd, cooling properties",
            rating: 4.2,
            reviews: 63,
            stock: 42,
            organicCertified: true
        },
        29: { 
            name: "Organic Green Beans",
            category: "Vegetables",
            originalPrice: 79,
            discount: 13,
            prices: {
                1: 69,   // 250g
                2: 138,  // 500g
                3: 276,  // 1kg
                4: 552   // 2kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "1kg",
                4: "2kg"
            },
            image: "https://media.istockphoto.com/id/1412931086/photo/fresh-green-bean-pods-texture-close-up-top-view.jpg?s=612x612&w=0&k=20&c=59qXWquEIFyaUc4AxvPcBzIIwtG823L8cuej7lDwHZE=",
            description: "French beans, fiber rich",
            rating: 4.4,
            reviews: 81,
            stock: 58,
            organicCertified: true
        },
        30: { 
            name: "Organic Green Peas",
            category: "Vegetables",
            originalPrice: 69,
            discount: 14,
            prices: {
                1: 59,   // 250g
                2: 118,  // 500g
                3: 236,  // 1kg
                4: 472   // 2kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "1kg",
                4: "2kg"
            },
            image: "https://media.istockphoto.com/id/999021878/photo/fresh-organic-green-peas-on-rustic-wooden-background.jpg?s=612x612&w=0&k=20&c=5QwpuJVvzXe4B-_WBXQAO_Vi-ViCRWlDapLMVXqugrg=",
            description: "Sweet green peas, protein source",
            rating: 4.5,
            reviews: 96,
            stock: 65,
            organicCertified: true
        },
        31: { 
            name: "Organic Cluster Beans",
            category: "Vegetables",
            originalPrice: 59,
            discount: 17,
            prices: {
                1: 49,   // 250g
                2: 98,   // 500g
                3: 196,  // 1kg
                4: 392   // 2kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "1kg",
                4: "2kg"
            },
            image: "https://dayli.in/cdn/shop/files/cluster-beans-250-g-product-images-o590000155-p590000155-0-202409171905.webp?v=1755888927",
            description: "Cluster beans, diabetic friendly",
            rating: 4.1,
            reviews: 49,
            stock: 38,
            organicCertified: true
        },
        32: { 
            name: "Organic Broad Beans",
            category: "Vegetables",
            originalPrice: 69,
            discount: 14,
            prices: {
                1: 59,   // 250g
                2: 118,  // 500g
                3: 236,  // 1kg
                4: 472   // 2kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "1kg",
                4: "2kg"
            },
            image: "https://4.imimg.com/data4/WW/WW/GLADMIN-/media-catalog-product-cache-1-small_image-295x295-9df78eab33525d08d6e5fb8d27136e95-b-r-broad-beans.jpg",
            description: "Broad beans, iron rich",
            rating: 4.2,
            reviews: 57,
            stock: 44,
            organicCertified: true
        },
        33: { 
            name: "Organic Green Mangoes",
            category: "Vegetables",
            originalPrice: 59,
            discount: 17,
            prices: {
                1: 49,   // 500g
                2: 98,   // 1kg
                3: 196,  // 2kg
                4: 294   // 3kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "2kg",
                4: "3kg"
            },
            image: "https://www.shutterstock.com/image-photo/green-mango-leaf-on-basket-260nw-653583370.jpg",
            description: "Raw mangoes, perfect for pickles",
            rating: 4.3,
            reviews: 72,
            stock: 52,
            organicCertified: true,
            seasonal: true
        },
        34: { 
            name: "Organic Curry Leaves",
            category: "Vegetables",
            originalPrice: 69,
            discount: 14,
            prices: {
                1: 59,   // 100g
                2: 147,  // 250g
                3: 294,  // 500g
                4: 588   // 1kg
            },
            weight: {
                1: "100g",
                2: "250g",
                3: "500g",
                4: "1kg"
            },
            image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQlyhVQTGNyA75ATVKcyRz8SMk980lbJ3zOFw&s",
            description: "Aromatic curry leaves, digestive aid",
            rating: 4.7,
            reviews: 118,
            stock: 90,
            organicCertified: true
        },
        35: { 
            name: "Organic Cauliflower",
            category: "Vegetables",
            originalPrice: 49,
            discount: 20,
            prices: {
                1: 39,   // 500g
                2: 78,   // 1kg
                3: 117,  // 1.5kg
                4: 156   // 2kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "1.5kg",
                4: "2kg"
            },
            image: "https://watermark.lovepik.com/photo/20211130/large/lovepik-organic-cauliflower-picture_501211111.jpg",
            description: "Fresh cauliflower, Vitamin C rich",
            rating: 4.4,
            reviews: 103,
            stock: 70,
            organicCertified: true
        },
        36: { 
            name: "Organic Cabbage",
            category: "Vegetables",
            originalPrice: 45,
            discount: 22,
            prices: {
                1: 35,   // 500g
                2: 70,   // 1kg
                3: 105,  // 1.5kg
                4: 140   // 2kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "1.5kg",
                4: "2kg"
            },
            image: "https://media.istockphoto.com/id/503870662/photo/fresh-ripe-cabbage.jpg?s=612x612&w=0&k=20&c=ny2sApn89JO6K8jpByXU9EUi9nOXnRkiuSOODvntULM=",
            description: "Green cabbage, detoxifying properties",
            rating: 4.3,
            reviews: 89,
            stock: 62,
            organicCertified: true
        },

        // Dairy & Eggs (37-40)
        37: { 
            name: "Organic Cow Milk",
            category: "Dairy",
            originalPrice: 90,
            discount: 17,
            prices: {
                1: 75,   // 500ml
                2: 150,  // 1L
                3: 300,  // 2L
                4: 450,  // 3L
                5: 750   // 5L
            },
            weight: {
                1: "500ml",
                2: "1L",
                3: "2L",
                4: "3L",
                5: "5L"
            },
            image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
            description: "Fresh organic cow milk, hormone free",
            rating: 4.8,
            reviews: 342,
            stock: 200,
            organicCertified: true,
            refrigeration: true
        },
        38: { 
            name: "Desi Cow Ghee",
            category: "Dairy",
            originalPrice: 699,
            discount: 14,
            prices: {
                1: 599,  // 200ml
                2: 1497, // 500ml
                3: 2994, // 1L
                4: 5988  // 2L
            },
            weight: {
                1: "200ml",
                2: "500ml",
                3: "1L",
                4: "2L"
            },
            image: "https://t3.ftcdn.net/jpg/07/25/62/64/360_F_725626447_vJOVfhq0warxn3Kl18XYRkYMh1Z0Ouqp.jpg",
            description: "A2 bilona ghee, traditional method",
            rating: 4.9,
            reviews: 287,
            stock: 80,
            organicCertified: true
        },
        39: { 
            name: "Organic Paneer",
            category: "Dairy",
            originalPrice: 150,
            discount: 20,
            prices: {
                1: 120,  // 200g
                2: 300,  // 500g
                3: 600,  // 1kg
                4: 1200  // 2kg
            },
            weight: {
                1: "200g",
                2: "500g",
                3: "1kg",
                4: "2kg"
            },
            image: "https://t3.ftcdn.net/jpg/06/35/16/94/360_F_635169408_OcThRpearTKfkXwiuhpjOeD0MdvqyHzV.jpg",
            description: "Fresh homemade paneer, protein rich",
            rating: 4.7,
            reviews: 198,
            stock: 60,
            organicCertified: true,
            refrigeration: true
        },
        40: { 
            name: "Organic Eggs",
            category: "Dairy",
            originalPrice: 120,
            discount: 18,
            prices: {
                1: 99,   // 6 eggs
                2: 198,  // 12 eggs
                3: 396,  // 24 eggs
                4: 495   // 30 eggs
            },
            weight: {
                1: "6 eggs",
                2: "12 eggs",
                3: "24 eggs",
                4: "30 eggs"
            },
            image: "https://i.pinimg.com/736x/f9/b1/4d/f9b14dcc79ed2d5efc42a83f756023e8.jpg",
            description: "Free range organic eggs, omega-3 rich",
            rating: 4.8,
            reviews: 256,
            stock: 150,
            organicCertified: true,
            refrigeration: true
        },

        // Grains & Pulses (41-44)
        41: { 
            name: "Organic Brown Rice",
            category: "Grains",
            originalPrice: 150,
            discount: 20,
            prices: {
                1: 120,  // 2kg
                2: 600,  // 10kg
                3: 900,  // 15kg
                4: 1200, // 20kg
                5: 1800  // 30kg
            },
            weight: {
                1: "2kg",
                2: "10kg",
                3: "15kg",
                4: "20kg",
                5: "30kg"
            },
            image: "https://media.gettyimages.com/id/155392869/photo/brown-rice.jpg?s=612x612&w=gi&k=20&c=vtmQKmx8AOHhiHvzXYSxF2bb2Qvu_0Z0YKwevI5Harw=",
            description: "Whole grain brown rice, fiber rich",
            rating: 4.6,
            reviews: 167,
            stock: 100,
            organicCertified: true
        },
        42: { 
            name: "Organic Whole Wheat",
            category: "Grains",
            originalPrice: 110,
            discount: 23,
            prices: {
                1: 85,   // 2kg
                2: 425,  // 10kg
                3: 637,  // 15kg
                4: 850,  // 20kg
                5: 1275  // 30kg
            },
            weight: {
                1: "2kg",
                2: "10kg",
                3: "15kg",
                4: "20kg",
                5: "30kg"
            },
            image: "https://nutrisum.in/cdn/shop/articles/The_Digestive_and_Energizing_Power_of_Whole_Wheat__Unveiling_its_Benefits.png?v=1706006243&width=1100",
            description: "Stone ground whole wheat flour",
            rating: 4.5,
            reviews: 143,
            stock: 90,
            organicCertified: true
        },
        43: { 
            name: "Organic Moong Dal",
            category: "Pulses",
            originalPrice: 120,
            discount: 21,
            prices: {
                1: 95,   // 500g
                2: 190,  // 1kg
                3: 380,  // 2kg
                4: 950   // 5kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "2kg",
                4: "5kg"
            },
            image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHNu3alj7KOV1_Reu_mhUk35Q0rEMiJjvHtQ&s",
            description: "Split green gram, easy to digest",
            rating: 4.7,
            reviews: 178,
            stock: 75,
            organicCertified: true
        },
        44: { 
            name: "Organic Toor Dal",
            category: "Pulses",
            originalPrice: 135,
            discount: 19,
            prices: {
                1: 110,  // 500g
                2: 220,  // 1kg
                3: 440,  // 2kg
                4: 1100  // 5kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "2kg",
                4: "5kg"
            },
            image: "https://cdn.shopaccino.com/edible-smart/products/toor-dal-min-scaled-740285_l.jpg?v=621",
            description: "Pigeon pea, protein source",
            rating: 4.6,
            reviews: 154,
            stock: 68,
            organicCertified: true
        },

        // Spices & Masalas (45-48)
        45: { 
            name: "Organic Turmeric Powder",
            category: "Spices",
            originalPrice: 199,
            discount: 25,
            prices: {
                1: 149,  // 500g
                2: 298,  // 1kg
                3: 894,  // 3kg
                4: 1490  // 5kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "3kg",
                4: "5kg"
            },
            image: "https://t3.ftcdn.net/jpg/02/12/84/78/360_F_212847847_o4fXT2BF7CTwqVly0mvGL4UEgGGgpibU.jpg",
            description: "Pure turmeric powder, anti-inflammatory",
            rating: 4.8,
            reviews: 234,
            stock: 120,
            organicCertified: true
        },
        46: { 
            name: "Organic Red Chilli Powder",
            category: "Spices",
            originalPrice: 159,
            discount: 19,
            prices: {
                1: 129,  // 500g
                2: 258,  // 1kg
                3: 774,  // 3kg
                4: 1290  // 5kg
            },
            weight: {
                1: "500g",
                2: "1kg",
                3: "3kg",
                4: "5kg"
            },
            image: "https://t3.ftcdn.net/jpg/06/80/54/68/360_F_680546849_7mdFrXHwq5j3kguMUzdSUgpnRLcfcTQd.jpg",
            description: "Spicy red chilli powder",
            rating: 4.5,
            reviews: 189,
            stock: 95,
            organicCertified: true
        },
        47: { 
            name: "Organic Garam Masala",
            category: "Spices",
            originalPrice: 219,
            discount: 18,
            prices: {
                1: 179,  // 250g
                2: 358,  // 500g
                3: 537,  // 750g
                4: 716   // 1kg
            },
            weight: {
                1: "250g",
                2: "500g",
                3: "750g",
                4: "1kg"
            },
            image: "https://media.istockphoto.com/id/1303873308/photo/garam-masala.jpg?s=612x612&w=0&k=20&c=WYJUE-NcP-hrWChWtdqYPXMBcbhzPVI0bsHlyEJ928E=",
            description: "Aromatic spice blend, homemade recipe",
            rating: 4.7,
            reviews: 167,
            stock: 85,
            organicCertified: true
        },
        48: { 
            name: "Organic Cumin Seeds",
            category: "Spices",
            originalPrice: 129,
            discount: 23,
            prices: {
                1: 99,   // 100g
                2: 247,  // 250g
                3: 494,  // 500g
                4: 741   // 750g
            },
            weight: {
                1: "100g",
                2: "250g",
                3: "500g",
                4: "750g"
            },
            image: "https://www.adidevgroup.com/img/products/ipm-cumin-seed.jpg",
            description: "Jeera seeds, digestive aid",
            rating: 4.6,
            reviews: 142,
            stock: 78,
            organicCertified: true
        }
    };

    // Store the current OTP for verification
    let currentOtp = '';

    // Coupon codes database
    const couponDatabase = {
        'WELCOME10': { 
            discount: 10, 
            type: 'percentage', 
            minAmount: 500,
            maxDiscount: 200,
            description: 'Welcome discount for new customers'
        },
        'SAVE20': { 
            discount: 20, 
            type: 'percentage', 
            minAmount: 1000,
            maxDiscount: 500,
            description: 'Special savings coupon'
        },
        'FLAT50': { 
            discount: 50, 
            type: 'fixed', 
            minAmount: 300,
            maxDiscount: 50,
            description: 'Flat ₹50 off on your order'
        },
        'FREESHIP': { 
            discount: 0, 
            type: 'shipping', 
            minAmount: 0,
            maxDiscount: 50,
            description: 'Free shipping on your order'
        },
        'ORGANIC25': { 
            discount: 25, 
            type: 'percentage', 
            minAmount: 1500,
            maxDiscount: 1000,
            description: '25% off on organic products'
        }
    };

    // Active coupon (if any)
    let activeCoupon = null;

    // QR Code Timer and Payment System Variables
    let qrTimer;
    let timeLeft = 300; // 5 minutes in seconds
    let isQRGenerated = false;
    let qrExpired = false;
    let upiPaymentInProgress = false;

    // Track delivery details with numbered steps
    const deliveryTracking = {
        getDeliveryDate: function() {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return tomorrow.toLocaleDateString('en-IN', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'short' 
            });
        },
        
        getTrackingNumber: function() {
            return 'TRK' + Date.now().toString().slice(-10);
        },
        
        getDeliveryWindow: function() {
            const windows = [
                '9:00 AM - 12:00 PM',
                '12:00 PM - 3:00 PM',
                '3:00 PM - 6:00 PM',
                '6:00 PM - 9:00 PM'
            ];
            return windows[Math.floor(Math.random() * windows.length)];
        },
        
        getDeliveryAgent: function() {
            const agents = ['Rajesh Kumar', 'Amit Sharma', 'Priya Patel', 'Suresh Nair', 'Meena Singh'];
            return agents[Math.floor(Math.random() * agents.length)];
        },
        
        getDeliveryContact: function() {
            return '+91 9' + Math.floor(Math.random() * 900000000 + 100000000);
        },
        
        generateStatus: function() {
            const statuses = [
                { 
                    number: 1,
                    status: 'Delivery', 
                    description: 'Your order has been dispatched and is on its way', 
                    time: '10:30 AM',
                    subStatus: 'Package picked up from warehouse',
                    icon: 'fa-truck'
                },
                { 
                    number: 2,
                    status: 'Payment', 
                    description: 'Payment has been successfully processed', 
                    time: '10:15 AM',
                    subStatus: 'UPI transaction completed',
                    icon: 'fa-credit-card'
                },
                { 
                    number: 3,
                    status: 'Confirmation', 
                    description: 'Order confirmed and ready for delivery', 
                    time: '10:00 AM',
                    subStatus: 'Order verification complete',
                    icon: 'fa-check-circle'
                }
            ];
            return statuses;
        },
        
        getCurrentStep: function(orderStatus) {
            const statusMap = {
                'confirmed': 3,
                'processing': 2,
                'packed': 1,
                'dispatched': 1,
                'out_for_delivery': 1,
                'delivered': 1
            };
            return statusMap[orderStatus] || 3;
        }
    };
 (function() {
        const termsLink = document.getElementById('termsLink');
        const privacyLink = document.getElementById('privacyLink');
        const termsCheck = document.getElementById('terms');
        const errorSpan = document.getElementById('terms-error');
        
        // Get content as HTML strings
        const termsHTML = document.getElementById('termsContent').innerHTML;
        const privacyHTML = document.getElementById('privacyContent').innerHTML;
        
        // Helper to open content in a new tab
        function openInNewTab(title, contentHTML) {
            const newTab = window.open();
            newTab.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Organic Mart - ${title}</title>
                    <style>
                        body {
                            font-family: 'Segoe UI', Roboto, system-ui, sans-serif;
                            max-width: 900px;
                            margin: 40px auto;
                            padding: 30px;
                            background: #fefdf5;
                            color: #1e3a1e;
                            line-height: 1.6;
                        }
                        h1 {
                            color: #2b6e2b;
                            border-bottom: 3px solid #c8e6b5;
                            padding-bottom: 12px;
                        }
                        h3 {
                            color: #3a7b3a;
                            margin-top: 25px;
                            border-left: 4px solid #8bc34a;
                            padding-left: 12px;
                        }
                        p {
                            margin: 10px 0;
                        }
                        .footer {
                            margin-top: 40px;
                            padding-top: 20px;
                            border-top: 1px solid #d4e2c6;
                            font-size: 0.85rem;
                            color: #6a7a5e;
                            text-align: center;
                        }
                        @media (max-width: 600px) {
                            body { padding: 20px; margin: 20px; }
                        }
                    </style>
                </head>
                <body>
                    ${contentHTML}
                    <div class="footer">
                        Organic Mart — Pure. Ethical. Organic.
                    </div>
                </body>
                </html>
            `);
            newTab.document.close();
        }
        
        // Open Terms in new tab
        if (termsLink) {
            termsLink.addEventListener('click', (e) => {
                e.preventDefault();
                openInNewTab('Terms & Conditions', termsHTML);
            });
        }
        
        // Open Privacy in new tab
        if (privacyLink) {
            privacyLink.addEventListener('click', (e) => {
                e.preventDefault();
                openInNewTab('Privacy Policy', privacyHTML);
            });
        }
        
        // Validation for checkbox
        if (termsCheck) {
            termsCheck.addEventListener('change', () => {
                if (termsCheck.checked && errorSpan) {
                    errorSpan.textContent = '';
                }
            });
        }
        
        // Auto attach to any surrounding form for validation
        const parentForm = document.querySelector('form');
        if (parentForm) {
            parentForm.addEventListener('submit', function(e) {
                const cb = document.getElementById('terms');
                if (cb && !cb.checked) {
                    e.preventDefault();
                    if (errorSpan) {
                        errorSpan.textContent = '❌ You must agree to the Terms & Conditions and Privacy Policy';
                    }
                    cb.focus();
                }
            });
        }
    })();
    // ===== REVIEWS SECTION DATA =====
    let userReviews = [
        {
            id: 1,
            productId: 1,
            productName: 'Organic Shimla Apples',
            productImage: 'https://w0.peakpx.com/wallpaper/182/615/HD-wallpaper-fruits-apple-fruit.jpg',
            rating: 5,
            title: 'Excellent quality! Fresh and delicious',
            content: 'These apples were fresh, crispy, and perfectly sweet. The organic quality really shows in the taste. Will definitely order again!',
            recommend: true,
            purchaseDate: '15 Dec 2023',
            reviewDate: '2 weeks ago'
        },
        {
            id: 2,
            productId: 37,
            productName: 'Organic Cow Milk',
            productImage: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
            rating: 4.5,
            title: 'Pure and natural taste',
            content: 'Good quality honey with natural sweetness. Could be a bit thicker, but overall satisfied with the purchase.',
            recommend: true,
            purchaseDate: '10 Dec 2023',
            reviewDate: '3 weeks ago'
        },
        {
            id: 3,
            productId: 20,
            productName: 'Organic Tomatoes',
            productImage: 'https://images.pexels.com/photos/1327838/pexels-photo-1327838.jpeg',
            rating: 4,
            title: 'Fresh but small quantity',
            content: 'The broccoli was fresh and green, good quality. However, the 1kg pack seemed a bit less in quantity compared to what I usually get. Taste was good though.',
            recommend: false,
            purchaseDate: '5 Dec 2023',
            reviewDate: '1 month ago'
        }
    ];
    
    let currentEditReviewId = null;

    // ===== ADDRESS SYNCHRONIZATION =====
    function syncAddressesToCheckout() {
        console.log('Synchronizing addresses to checkout...');
        
        if (pages.checkout && pages.checkout.classList.contains('active')) {
            renderCheckoutAddresses();
            
            const savedAddressesContainer = document.getElementById('saved-addresses-container');
            if (savedAddressesContainer && userData.addresses && userData.addresses.length > 0) {
                savedAddressesContainer.innerHTML = '';
                
                userData.addresses.forEach((address, index) => {
                    const addressItem = createAddressElement(address);
                    savedAddressesContainer.appendChild(addressItem);
                });
                
                const addNewAddressItem = document.createElement('div');
                addNewAddressItem.className = 'saved-address-item add-new-item';
                addNewAddressItem.innerHTML = `
                    <input type="radio" id="address-new" name="saved-address" value="new">
                    <label for="address-new">
                        <div class="address-content">
                            <strong style="color: #4CAF50;">+ Add New Address</strong>
                            <p style="color: #666; margin-top: 5px;">Click to enter a new delivery address</p>
                        </div>
                    </label>
                `;
                
                savedAddressesContainer.appendChild(addNewAddressItem);
                
                const defaultAddress = userData.addresses.find(addr => addr.default);
                if (defaultAddress) {
                    const defaultRadio = document.getElementById(`address-${defaultAddress.id}`);
                    if (defaultRadio) {
                        defaultRadio.checked = true;
                        const addressForm = document.getElementById('address-form');
                        if (addressForm) addressForm.style.display = 'none';
                    }
                }
                
                attachAddressEventListeners();
            }
        }
    }

    function createAddressElement(address) {
        const addressItem = document.createElement('div');
        addressItem.className = 'saved-address-item';
        
        addressItem.innerHTML = `
            <input type="radio" id="address-${address.id}" name="saved-address" value="${address.id}">
            <label for="address-${address.id}">
                <div class="address-content">
                    <strong>${address.name} ${address.default ? '<span style="color: #4CAF50; font-size: 12px; margin-left: 8px;">(Default)</span>' : ''}</strong><br>
                    ${address.street}<br>
                    ${address.city}, ${address.state} - ${address.pincode}<br>
                    Phone: ${address.phone}
                </div>
                <button type="button" class="btn-edit-address" data-address-id="${address.id}">Edit</button>
            </label>
        `;
        
        return addressItem;
    }

    function attachAddressEventListeners() {
        document.querySelectorAll('input[name="saved-address"]').forEach(radio => {
            radio.addEventListener('change', function() {
                const addressForm = document.getElementById('address-form');
                if (this.value === 'new') {
                    if (addressForm) addressForm.style.display = 'block';
                } else {
                    if (addressForm) addressForm.style.display = 'none';
                }
            });
        });
        
        document.querySelectorAll('.btn-edit-address').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const addressId = parseInt(this.getAttribute('data-address-id'));
                editAddress(addressId);
            });
        });
    }

    // ===== INFO PAGES INITIALIZATION =====
    function initializeInfoPages() {
        console.log('Initializing info pages...');
        
        // Hide all info pages initially
        document.querySelectorAll('.info-page').forEach(page => {
            page.style.display = 'none';
        });
        
        // Setup footer links for info pages
        setupInfoPageLinks();
        
        // Initialize FAQ functionality
        initializeFAQ();
    }

    // ===== SETUP INFO PAGE LINKS =====
    function setupInfoPageLinks() {
        // Delivery Information links
        document.querySelectorAll('a[href="#delivery-info"], .footer-col ul li a:contains("Delivery Information")').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                showInfoPage('delivery-info-page');
            });
        });
        
        // Returns Policy links
        document.querySelectorAll('a[href="#returns-policy"], .footer-col ul li a:contains("Returns Policy")').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                showInfoPage('returns-policy-page');
            });
        });
        
        // FAQs links
        document.querySelectorAll('a[href="#faqs"], .footer-col ul li a:contains("FAQs"), .faq-link').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                showInfoPage('faqs-page');
            });
        });
    }

    // ===== SHOW INFO PAGE =====
    window.showInfoPage = function(pageId) {
        console.log('Showing info page:', pageId);
        
        // Hide all main pages
        Object.keys(pages).forEach(key => {
            if (pages[key]) {
                pages[key].style.display = 'none';
                pages[key].classList.remove('active');
            }
        });
        
        // Hide all info pages
        document.querySelectorAll('.info-page').forEach(page => {
            page.style.display = 'none';
        });
        
        // Show selected info page
        const infoPage = document.getElementById(pageId);
        if (infoPage) {
            infoPage.style.display = 'block';
            infoPage.scrollIntoView({ behavior: 'smooth' });
            
            // If it's the FAQs page, initialize FAQ search
            if (pageId === 'faqs-page') {
                setTimeout(() => {
                    initializeFAQ();
                }, 100);
            }
        }
    };

    // ===== SETUP INFO PAGE BUTTONS =====
    function setupInfoPageButtons() {
        // Setup back buttons on info pages
        document.querySelectorAll('.info-page .btn-back, .info-page .btn-secondary, .info-page .btn-primary[onclick*="goBack"]').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                showPage('products');
            });
        });
        
        // Setup continue shopping buttons on info pages
        document.querySelectorAll('.info-page .btn-primary[onclick*="showPage"], .info-page .btn-primary[onclick*="Continue Shopping"]').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                showPage('products');
            });
        });
    }

    // ===== FAQ FUNCTIONALITY =====
    function initializeFAQ() {
        console.log('Initializing FAQ accordion...');
        
        // Toggle FAQ accordion
        window.toggleFAQ = function(element) {
            const faqItem = element.closest('.faq-item');
            if (faqItem) {
                faqItem.classList.toggle('active');
                
                // Close other open FAQs
                const otherItems = document.querySelectorAll('.faq-item.active');
                otherItems.forEach(item => {
                    if (item !== faqItem) {
                        item.classList.remove('active');
                    }
                });
            }
        };

        // Search FAQs
        window.searchFAQs = function() {
            const searchTerm = document.getElementById('faqSearch')?.value.toLowerCase() || '';
            const faqItems = document.querySelectorAll('.faq-item');
            
            faqItems.forEach(item => {
                const question = item.querySelector('.faq-question h3')?.textContent.toLowerCase() || '';
                const answer = item.querySelector('.answer-content')?.textContent.toLowerCase() || '';
                
                if (question.includes(searchTerm) || answer.includes(searchTerm) || searchTerm === '') {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        };

        // Filter FAQs by Category
        const categoryBtns = document.querySelectorAll('.faq-categories .category-btn');
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                
                // Remove active class from all buttons
                categoryBtns.forEach(b => b.classList.remove('active'));
                // Add active class to clicked button
                this.classList.add('active');
                
                const category = this.getAttribute('data-category');
                const faqItems = document.querySelectorAll('.faq-item');
                
                faqItems.forEach(item => {
                    if (category === 'all' || item.getAttribute('data-category') === category) {
                        item.style.display = 'block';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        });
    }

    // ===== CONTACT SUPPORT FUNCTION =====
    window.contactSupport = function() {
        alert('Customer Support:\n\n📞 Phone: 1800-123-4567\n✉️ Email: support@organicmart.com\n🕒 Hours: 8 AM - 10 PM (Mon-Sat)\n\nOur team is ready to help you!');
    };

    // ===== START RETURN FUNCTION =====
    window.startReturn = function() {
        if (userData && userData.isLoggedIn) {
            showPage('profile');
            setTimeout(() => {
                // Switch to orders tab
                const ordersTab = document.querySelector('.profile-nav-item[data-tab="orders"]');
                if (ordersTab) ordersTab.click();
                
                alert('Please go to My Orders section and click on "Return Item" next to the product you want to return.');
            }, 500);
        } else {
            alert('Please login to start a return.');
            showPage('login');
        }
    };

    // ===== OPEN LIVE CHAT FUNCTION =====
    window.openLiveChat = function() {
        alert('Live Chat is currently under maintenance. Please contact us via phone or email.\n\n📞 1800-123-4567\n✉️ support@organicmart.com');
    };

    // ===== DEMO TRACKING FUNCTION =====
    window.demoTracking = function() {
        if (userData && userData.orders && userData.orders.length > 0) {
            const orderId = userData.orders[userData.orders.length - 1].id;
            showOrderTracking(orderId);
        } else {
            alert('Demo Tracking:\n\nOrder #OM123456\nStatus: Out for Delivery\nExpected Delivery: Today, 2:00 PM - 4:00 PM\nDelivery Agent: Rajesh Kumar\nContact: +91 9876543210\nTracking Number: TRK1234567890');
        }
    };

    // ===== GO BACK FUNCTION =====
    window.goBack = function() {
        showPage('products');
    };

    // Initialize the application
    function init() {
        console.log('Initializing Organic Mart...');
        
        // First, ensure only one page is active
        initializePages();
        
        // Prevent scrolling on login page only
        preventLoginPageScroll();
        
        // Load data and setup
        loadUserData();
        setupEventListeners();
        checkLoginStatus();
        addToastStyles();
        addNotificationStyles();
        addScrollFixStyles();
        initializeInfoPages();
        initializeCategoryFilters();
        setupInfoPageButtons();
        addConfirmationPageStyles();
        setupConfirmationButtons();
        addOrderPanelStyles(); // Add styles for the order details panel
        
        console.log('Initialization complete');
    }

    // ===== CATEGORY FILTERS =====
    function initializeCategoryFilters() {
        const categoryCards = document.querySelectorAll('.category-card');
        const clearFiltersBtn = document.getElementById('clearFilters');
        
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', function(e) {
                e.preventDefault();
                
                categoryCards.forEach(card => {
                    card.style.display = "block";
                });
                
                const categoriesContainer = document.querySelector('.categories');
                if (categoriesContainer) {
                    const allElements = categoriesContainer.querySelectorAll('h2, h3, .section-title, .category-section, .category-group, .category-heading, .category-item');
                    allElements.forEach(element => {
                        element.style.display = "block";
                        element.style.visibility = "visible";
                        element.style.opacity = "1";
                    });
                }
                
                const allHeadings = document.querySelectorAll('.section-title, .category-title, .featured-title');
                allHeadings.forEach(heading => {
                    heading.style.display = "block";
                    heading.style.visibility = "visible";
                    heading.style.opacity = "1";
                });
                
                clearFiltersBtn.style.display = "none";
                clearFiltersBtn.style.visibility = "hidden";
                clearFiltersBtn.style.opacity = "0";
                
                const activeFilters = document.querySelectorAll('.category-filter.active');
                activeFilters.forEach(filter => {
                    filter.classList.remove('active');
                });
                
                const allProductsFilter = document.querySelector('.category-filter[data-category="all"]');
                if (allProductsFilter) {
                    allProductsFilter.classList.add('active');
                }
                
                const productCards = document.querySelectorAll('.product-card');
                productCards.forEach(card => {
                    card.style.display = 'block';
                });
                
                const categoryTitle = document.querySelector('.category-title');
                if (categoryTitle) {
                    categoryTitle.textContent = 'All Products';
                }
                
                const productCount = document.querySelector('.product-count');
                if (productCount && productCards.length > 0) {
                    const visibleCount = productCards.length;
                    productCount.textContent = `${visibleCount} products`;
                }
                
                showToastMessage('All filters cleared');
            });
        }
    }

    function addCategoryFilterStyles() {
        if (!document.querySelector('#category-filter-styles')) {
            const style = document.createElement('style');
            style.id = 'category-filter-styles';
            style.textContent = `
               
            `;
            document.head.appendChild(style);
        }
    }

    addCategoryFilterStyles();

    // ===== FIXED SEARCH FUNCTION - HIDES CATEGORY HEADINGS =====
    function searchProducts(query) {
        const productCards = document.querySelectorAll('.product-card');
        const searchTerm = query.toLowerCase().trim();
        
        // First, show all category headings
        const allHeadings = document.querySelectorAll('.categories h2, .categories h3, .category-section h2, .category-section h3, .section-title');
        allHeadings.forEach(heading => {
            heading.style.display = "block";
            heading.style.visibility = "visible";
            heading.style.opacity = "1";
        });
        
        // If search term is empty, show all products and all headings
        if (searchTerm === '') {
            productCards.forEach(card => {
                card.style.display = 'block';
            });
            
            const clearFiltersBtn = document.getElementById('clearFilters');
            if (clearFiltersBtn) {
                clearFiltersBtn.style.display = 'none';
            }
            
            const categoryTitle = document.querySelector('.category-title');
            if (categoryTitle) {
                categoryTitle.textContent = 'All Products';
            }
            
            const productCount = document.querySelector('.product-count');
            if (productCount) {
                productCount.textContent = `${productCards.length} products`;
            }
            
            return;
        }
        
        // Filter products based on search term
        let visibleCount = 0;
        const visibleCategories = new Set();
        
        productCards.forEach(card => {
            const productId = parseInt(card.getAttribute('data-product-id'));
            const product = productDatabase[productId];
            
            if (product) {
                const productName = product.name.toLowerCase();
                const productCategory = product.category.toLowerCase();
                
                if (productName.includes(searchTerm) || productCategory.includes(searchTerm)) {
                    card.style.display = 'block';
                    visibleCount++;
                    visibleCategories.add(product.category);
                } else {
                    card.style.display = 'none';
                }
            }
        });
        
        // HIDE ALL CATEGORY HEADINGS EXCEPT THOSE WITH VISIBLE PRODUCTS
        const categorySections = document.querySelectorAll('.category-section, .category-group');
        
        categorySections.forEach(section => {
            // Check if this section has any visible products
            const sectionHeading = section.querySelector('h2, h3');
            if (sectionHeading) {
                const sectionText = sectionHeading.textContent || '';
                let shouldShow = false;
                
                // Check if any category in visibleCategories matches this section
                visibleCategories.forEach(category => {
                    if (sectionText.includes(category) || 
                        sectionText.includes('Fruit') && category === 'Fruits' ||
                        sectionText.includes('Vegetable') && category === 'Vegetables' ||
                        sectionText.includes('Dairy') && category === 'Dairy' ||
                        sectionText.includes('Grain') && category === 'Grains' ||
                        sectionText.includes('Pulse') && category === 'Pulses' ||
                        sectionText.includes('Spice') && category === 'Spices') {
                        shouldShow = true;
                    }
                });
                
                if (shouldShow && visibleCount > 0) {
                    section.style.display = 'block';
                    if (sectionHeading) {
                        sectionHeading.style.display = 'block';
                        sectionHeading.style.visibility = 'visible';
                        sectionHeading.style.opacity = '1';
                    }
                } else {
                    section.style.display = 'none';
                    if (sectionHeading) {
                        sectionHeading.style.display = 'none';
                        sectionHeading.style.visibility = 'hidden';
                        sectionHeading.style.opacity = '0';
                    }
                }
            }
        });
        
        // Also hide individual category headings that don't have visible products
        const allCategoryHeadings = document.querySelectorAll('.categories h2, .categories h3, .section-title, .category-title');
        allCategoryHeadings.forEach(heading => {
            // Don't hide the main "Shop by Category" heading if there are visible products
            if (heading.textContent.includes('Shop by Category') || heading.textContent.includes('Categories')) {
                if (visibleCount > 0) {
                    heading.style.display = 'block';
                    heading.style.visibility = 'visible';
                    heading.style.opacity = '1';
                } else {
                    heading.style.display = 'none';
                }
                return;
            }
            
            // Check if this heading corresponds to a category with visible products
            let shouldShow = false;
            visibleCategories.forEach(category => {
                if (heading.textContent.includes(category) || 
                    heading.textContent.includes('Fruit') && category === 'Fruits' ||
                    heading.textContent.includes('Vegetable') && category === 'Vegetables' ||
                    heading.textContent.includes('Dairy') && category === 'Dairy' ||
                    heading.textContent.includes('Grain') && category === 'Grains' ||
                    heading.textContent.includes('Pulse') && category === 'Pulses' ||
                    heading.textContent.includes('Spice') && category === 'Spices') {
                    shouldShow = true;
                }
            });
            
            if (shouldShow && visibleCount > 0) {
                heading.style.display = 'block';
                heading.style.visibility = 'visible';
                heading.style.opacity = '1';
            } else {
                heading.style.display = 'none';
                heading.style.visibility = 'hidden';
                heading.style.opacity = '0';
            }
        });
        
        const clearFiltersBtn = document.getElementById('clearFilters');
        if (clearFiltersBtn) {
            if (visibleCount < productCards.length) {
                clearFiltersBtn.style.display = 'inline-block';
                clearFiltersBtn.style.visibility = 'visible';
                clearFiltersBtn.style.opacity = '1';
            } else {
                clearFiltersBtn.style.display = 'none';
            }
        }
        
        const categoryTitle = document.querySelector('.category-title');
        if (categoryTitle) {
            if (visibleCount === 0) {
                categoryTitle.textContent = `No products found for "${query}"`;
            } else {
                categoryTitle.textContent = `Search results for "${query}"`;
            }
        }
        
        const productCount = document.querySelector('.product-count');
        if (productCount) {
            if (visibleCount === 0) {
                productCount.textContent = `0 products`;
            } else {
                productCount.textContent = `${visibleCount} products`;
            }
        }
        
        showToastMessage(`Found ${visibleCount} products for "${query}"`);
    }

    function filterCategories(selectedCategory) {
        const categoryCards = document.querySelectorAll('.category-card');
        
        categoryCards.forEach(card => {
            const cardCategory = card.querySelector('h3')?.innerText || '';
            if (cardCategory === selectedCategory) {
                card.style.display = "block";
                card.style.animation = 'pulse 0.5s ease';
                setTimeout(() => {
                    card.style.animation = '';
                }, 500);
            } else {
                card.style.display = "none";
            }
        });
        
        const categoriesContainer = document.querySelector('.categories');
        if (categoriesContainer) {
            const allElements = categoriesContainer.querySelectorAll('h2, h3, .section-title, .category-section, .category-group, .category-heading');
            
            const headingMap = {
                'Fresh Fruits': 'Fresh Organic Fruits',
                'Fresh Vegetables': 'Fresh Organic Vegetables',
                'Dairy & Eggs': 'Dairy & Eggs',
                'Dairy': 'Dairy & Eggs',
                'Grains & Pulses': 'Grains & Pulses',
                'Grains': 'Grains & Pulses',
                'Pulses': 'Grains & Pulses',
                'Spices & Masalas': 'Spices & Masalas',
                'Spices': 'Spices & Masalas'
            };
            
            const expectedHeading = headingMap[selectedCategory] || selectedCategory;
            
            allElements.forEach(element => {
                const elementText = element.textContent || '';
                if (elementText.includes('Shop by Category') || elementText.includes('Categories')) {
                    element.style.display = "block";
                    element.style.visibility = "visible";
                    element.style.opacity = "1";
                    return;
                }
                if (elementText.includes(expectedHeading) || elementText.includes(selectedCategory)) {
                    element.style.display = "block";
                    element.style.visibility = "visible";
                    element.style.opacity = "1";
                } else {
                    element.style.display = "none";
                    element.style.visibility = "hidden";
                    element.style.opacity = "0";
                }
            });
            
            const categorySections = categoriesContainer.querySelectorAll('.category-section, .category-group, .category-item');
            categorySections.forEach(section => {
                const sectionText = section.textContent || '';
                if (!sectionText.includes(expectedHeading) && !sectionText.includes(selectedCategory)) {
                    section.style.display = "none";
                    section.style.visibility = "hidden";
                    section.style.opacity = "0";
                } else {
                    section.style.display = "block";
                    section.style.visibility = "visible";
                    section.style.opacity = "1";
                }
            });
        }
        
        const allPossibleHeadings = document.querySelectorAll('.section-title, .category-title, .featured-title');
        allPossibleHeadings.forEach(heading => {
            const headingText = heading.textContent || '';
            if (headingText.includes('Our Products') || headingText.includes('Featured')) {
                heading.style.display = "block";
                heading.style.visibility = "visible";
                heading.style.opacity = "1";
                return;
            }
            if (headingText.includes('Fruit') || headingText.includes('Vegetable') || 
                headingText.includes('Dairy') || headingText.includes('Grain') || 
                headingText.includes('Pulse') || headingText.includes('Spice')) {
                const headingMap = {
                    'Fresh Fruits': 'Fresh Organic Fruits',
                    'Fresh Vegetables': 'Fresh Organic Vegetables',
                    'Dairy & Eggs': 'Dairy & Eggs',
                    'Grains & Pulses': 'Grains & Pulses',
                    'Grains': 'Grains & Pulses',
                    'Pulses': 'Grains & Pulses',
                    'Spices & Masalas': 'Spices & Masalas'
                };
                const expectedHeading = headingMap[selectedCategory] || selectedCategory;
                if (!headingText.includes(expectedHeading) && !headingText.includes(selectedCategory)) {
                    heading.style.display = "none";
                    heading.style.visibility = "hidden";
                    heading.style.opacity = "0";
                }
            }
        });
        
        const clearFiltersBtn = document.getElementById('clearFilters');
        if (clearFiltersBtn) {
            clearFiltersBtn.style.display = "inline-block";
            clearFiltersBtn.style.visibility = "visible";
            clearFiltersBtn.style.opacity = "1";
        }
        
        const productCards = document.querySelectorAll('.product-card');
        if (productCards.length > 0) {
            const categoryMap = {
                'Fresh Fruits': 'Fruits',
                'Fresh Vegetables': 'Vegetables',
                'Dairy & Eggs': 'Dairy',
                'Dairy': 'Dairy',
                'Grains & Pulses': ['Grains', 'Pulses'],
                'Grains': 'Grains',
                'Pulses': 'Pulses',
                'Spices & Masalas': 'Spices',
                'Spices': 'Spices'
            };
            
            const actualCategory = categoryMap[selectedCategory] || selectedCategory;
            
            productCards.forEach(card => {
                const productId = parseInt(card.getAttribute('data-product-id'));
                if (productDatabase[productId]) {
                    const productCategory = productDatabase[productId].category;
                    if (Array.isArray(actualCategory)) {
                        card.style.display = actualCategory.includes(productCategory) ? 'block' : 'none';
                    } else {
                        card.style.display = productCategory === actualCategory ? 'block' : 'none';
                    }
                }
            });
            
            const categoryTitle = document.querySelector('.category-title');
            if (categoryTitle) {
                if (Array.isArray(actualCategory)) {
                    categoryTitle.textContent = `Grains & Pulses`;
                } else {
                    categoryTitle.textContent = `${actualCategory} Products`;
                }
            }
            
            const productCount = document.querySelector('.product-count');
            if (productCount) {
                const visibleCount = document.querySelectorAll('.product-card[style="display: block"]').length;
                productCount.textContent = `${visibleCount} products`;
            }
            
            const categoryFilters = document.querySelectorAll('.category-filter');
            categoryFilters.forEach(filter => {
                filter.classList.remove('active');
                if (Array.isArray(actualCategory)) {
                    if (filter.getAttribute('data-category') === 'Grains' || 
                        filter.getAttribute('data-category') === 'Pulses') {
                    } else if (filter.getAttribute('data-category') === 'all') {
                        filter.classList.add('active');
                    }
                } else {
                    if (filter.getAttribute('data-category') === actualCategory) {
                        filter.classList.add('active');
                    }
                }
            });
        }
        
        showToastMessage(`Showing: ${selectedCategory}`);
    }

    // ====== TAB MANAGEMENT ======
    function initializeTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabBtns.forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
        });
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const tabName = this.getAttribute('data-tab');
                switchTab(tabName);
            });
        });
        
        switchTab('username');
    }

    function switchTab(tabName) {
        currentTab = tabName;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            }
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
            if (content.id === `${tabName}-tab`) {
                content.classList.add('active');
            }
        });
        
        clearErrors();
    }

    // ====== PASSWORD VISIBILITY TOGGLE ======
    function initializePasswordToggles() {
        const passwordToggles = document.querySelectorAll('.password-toggle');
        
        passwordToggles.forEach(toggle => {
            toggle.addEventListener('click', function() {
                const targetId = this.getAttribute('data-target');
                const passwordInput = document.getElementById(targetId);
                const icon = this.querySelector('i');
                
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                } else {
                    passwordInput.type = 'password';
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                }
            });
        });
    }

    // ====== OTP INPUT HANDLING ======
    function initializeOTPInputs() {
        const otpInputs = document.querySelectorAll('.otp-input');
        
        otpInputs.forEach(input => {
            input.addEventListener('input', function(e) {
                const value = this.value;
                const index = parseInt(this.getAttribute('data-index'));
                
                if (value && !/^\d$/.test(value)) {
                    this.value = '';
                    return;
                }
                
                if (value.length === 1 && index < 6) {
                    const nextInput = document.getElementById(`otp${index + 1}`);
                    if (nextInput) nextInput.focus();
                }
                
                checkOTPCompletion();
            });
            
            input.addEventListener('keydown', function(e) {
                const index = parseInt(this.getAttribute('data-index'));
                
                if (e.key === 'Backspace' && !this.value && index > 1) {
                    const prevInput = document.getElementById(`otp${index - 1}`);
                    if (prevInput) prevInput.focus();
                }
            });
            
            input.addEventListener('paste', function(e) {
                e.preventDefault();
                const pastedData = e.clipboardData.getData('text').trim();
                
                if (/^\d{6}$/.test(pastedData)) {
                    const digits = pastedData.split('');
                    otpInputs.forEach((input, idx) => {
                        if (digits[idx]) {
                            input.value = digits[idx];
                        }
                    });
                    checkOTPCompletion();
                }
            });
        });
    }

    function checkOTPCompletion() {
        const otpInputs = document.querySelectorAll('.otp-input');
        const allFilled = Array.from(otpInputs).every(input => input.value.length === 1);
        const verifyBtn = document.querySelector('.verify-otp-btn');
        
        if (verifyBtn) {
            verifyBtn.disabled = !allFilled;
        }
    }

    // ====== EVENT LISTENERS ======
    function attachEventListeners() {
        if (showSignupLink) {
            showSignupLink.addEventListener('click', showSignupPage);
        }
        
        if (showLoginLink) {
            showLoginLink.addEventListener('click', showLoginPage);
        }
        
        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }
        
        if (signupForm) {
            signupForm.addEventListener('submit', handleSignup);
        }
        
        if (forgotPasswordLinks.length > 0) {
            forgotPasswordLinks.forEach(link => {
                link.addEventListener('click', showResetPassword);
            });
        }
        
        if (backToLoginBtn) {
            backToLoginBtn.addEventListener('click', showLoginForm);
        }
        
        const resetFormStep1 = document.getElementById('reset-form-step1');
        const resetFormStep2 = document.getElementById('reset-form-step2');
        const resetFormStep3 = document.getElementById('reset-form-step3');
        
        if (resetFormStep1) {
            resetFormStep1.addEventListener('submit', function(e) {
                e.preventDefault();
                handleResetStep1(e);
            });
        }
        
        if (resetFormStep2) {
            resetFormStep2.addEventListener('submit', function(e) {
                e.preventDefault();
                handleResetStep2(e);
            });
        }
        
        if (resetFormStep3) {
            resetFormStep3.addEventListener('submit', function(e) {
                e.preventDefault();
                handleResetStep3(e);
            });
        }
        
        const backToStep1Btn = document.getElementById('back-to-step1');
        if (backToStep1Btn) {
            backToStep1Btn.addEventListener('click', function() {
                showResetStep(1);
            });
        }
        
        const backToStep2Btn = document.getElementById('back-to-step2');
        if (backToStep2Btn) {
            backToStep2Btn.addEventListener('click', function() {
                showResetStep(2);
            });
        }
        
        const resendOtpBtn = document.getElementById('resend-otp');
        if (resendOtpBtn) {
            resendOtpBtn.addEventListener('click', function(e) {
                e.preventDefault();
                resendOTP();
            });
        }
        
        document.querySelectorAll('.social-btn').forEach(btn => {
            btn.addEventListener('click', handleSocialLogin);
        });
        
        const closeModalBtn = document.querySelector('.close-reset-modal');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', function() {
                if (resetSuccessModal) {
                    resetSuccessModal.classList.remove('active');
                }
                showLoginForm();
            });
        }
    }

    // ====== PAGE NAVIGATION ======
    function showSignupPage(e) {
        e.preventDefault();
        if (loginPage) loginPage.classList.remove('active');
        if (signupPage) signupPage.classList.add('active');
        clearForm(signupForm);
        clearErrors();
    }

    function showLoginPage(e) {
        e.preventDefault();
        if (signupPage) signupPage.classList.remove('active');
        if (loginPage) loginPage.classList.add('active');
        clearForm(loginForm);
        clearErrors();
        showLoginForm();
    }

    function showLoginForm() {
        if (resetPasswordSection) resetPasswordSection.style.display = 'none';
        if (loginForm) loginForm.style.display = 'block';
        clearResetForm();
        resetStep = 1;
        stopOTPTimer();
        switchTab('username');
    }

    function showResetPassword(e) {
        e.preventDefault();
        if (loginForm) loginForm.style.display = 'none';
        if (resetPasswordSection) resetPasswordSection.style.display = 'block';
        showResetStep(1);
        clearErrors();
    }

    // ====== RESET PASSWORD FLOW ======
    function showResetStep(step) {
        resetStep = step;
        
        document.getElementById('reset-step-1').style.display = 'none';
        document.getElementById('reset-step-2').style.display = 'none';
        document.getElementById('reset-step-3').style.display = 'none';
        
        document.getElementById(`reset-step-${step}`).style.display = 'block';
        
        if (step === 2) {
            startOTPTimer();
            focusOTPInput();
        }
    }

    function handleResetStep1(e) {
        const input = document.getElementById('reset-input').value.trim();
        const errorElement = document.getElementById('reset-error');
        
        if (!input) {
            showError(errorElement, 'Please enter email or phone number');
            return;
        }
        
        const isEmail = validateEmail(input);
        const isPhone = validatePhone(input);
        
        if (!isEmail && !isPhone) {
            showError(errorElement, 'Please enter a valid email or phone number');
            return;
        }
        
        resetIdentifier = input;
        
        const submitBtn = e.target.querySelector('.send-otp-btn');
        showLoading(submitBtn, true);
        
        generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`Generated OTP for ${input}: ${generatedOTP}`);
        
        const testOTPMessage = document.getElementById('test-otp-message');
        if (testOTPMessage) {
            testOTPMessage.innerHTML = `<strong>Test OTP (for demo): ${generatedOTP}</strong>`;
            testOTPMessage.style.display = 'block';
        }
        
        setTimeout(() => {
            showLoading(submitBtn, false);
            
            const otpMessage = document.getElementById('otp-message');
            const maskedInput = isEmail ? 
                maskEmail(input) : 
                maskPhone(input);
            otpMessage.textContent = `Enter the 6-digit OTP sent to ${maskedInput}`;
            
            showResetStep(2);
        }, 1500);
    }

    function handleResetStep2(e) {
        const otpInputs = document.querySelectorAll('.otp-input');
        const enteredOTP = Array.from(otpInputs).map(input => input.value).join('');
        const errorElement = document.getElementById('otp-error');
        
        if (enteredOTP.length !== 6) {
            showError(errorElement, 'Please enter the complete 6-digit OTP');
            return;
        }
        
        const submitBtn = e.target.querySelector('.verify-otp-btn');
        showLoading(submitBtn, true);
        
        setTimeout(() => {
            showLoading(submitBtn, false);
            
            console.log('Entered OTP:', enteredOTP);
            console.log('Generated OTP:', generatedOTP);
            
            if (enteredOTP === generatedOTP) {
                showResetStep(3);
                stopOTPTimer();
                const testOTPMessage = document.getElementById('test-otp-message');
                if (testOTPMessage) {
                    testOTPMessage.style.display = 'none';
                }
            } else {
                showError(errorElement, 'Invalid OTP. Please try again.');
                clearOTPInputs();
                focusOTPInput();
            }
        }, 1500);
    }

    function handleResetStep3(e) {
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-new-password').value;
        const newPasswordError = document.getElementById('new-password-error');
        const confirmPasswordError = document.getElementById('confirm-new-password-error');
        
        let isValid = true;
        
        hideError(newPasswordError);
        hideError(confirmPasswordError);
        
        if (!newPassword) {
            showError(newPasswordError, 'Please enter new password');
            isValid = false;
        } else if (newPassword.length < 6) {
            showError(newPasswordError, 'Password must be at least 6 characters');
            isValid = false;
        }
        
        if (!confirmPassword) {
            showError(confirmPasswordError, 'Please confirm your password');
            isValid = false;
        } else if (newPassword !== confirmPassword) {
            showError(confirmPasswordError, 'Passwords do not match');
            isValid = false;
        }
        
        if (!isValid) return;
        
        const submitBtn = e.target.querySelector('.reset-password-btn');
        showLoading(submitBtn, true);
        
        setTimeout(() => {
            showLoading(submitBtn, false);
            
            if (resetSuccessModal) {
                resetSuccessModal.classList.add('active');
            }
            clearResetForm();
            
            generatedOTP = '';
            resetIdentifier = '';
            resetStep = 1;
        }, 1500);
    }

    // ====== OTP TIMER ======
    function startOTPTimer() {
        otpTimeLeft = 120;
        updateOTPTimer();
        
        if (otpTimer) {
            clearInterval(otpTimer);
        }
        
        otpTimer = setInterval(() => {
            otpTimeLeft--;
            updateOTPTimer();
            
            if (otpTimeLeft <= 0) {
                stopOTPTimer();
            }
        }, 1000);
    }

    function updateOTPTimer() {
        const timerElement = document.getElementById('otp-timer');
        const resendBtn = document.getElementById('resend-otp');
        
        if (!timerElement || !resendBtn) return;
        
        const minutes = Math.floor(otpTimeLeft / 60);
        const seconds = otpTimeLeft % 60;
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        resendBtn.disabled = otpTimeLeft > 0;
        
        if (otpTimeLeft <= 30) {
            timerElement.style.color = '#f44336';
        } else if (otpTimeLeft <= 60) {
            timerElement.style.color = '#ff9800';
        } else {
            timerElement.style.color = '#4CAF50';
        }
    }

    function stopOTPTimer() {
        if (otpTimer) {
            clearInterval(otpTimer);
            otpTimer = null;
        }
    }

    function resendOTP() {
        if (otpTimeLeft > 0) {
            return;
        }
        
        const resendBtn = document.getElementById('resend-otp');
        const originalText = resendBtn.textContent;
        resendBtn.innerHTML = '<div class="loader small"></div>';
        resendBtn.disabled = true;
        
        generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`Resent OTP: ${generatedOTP}`);
        
        const testOTPMessage = document.getElementById('test-otp-message');
        if (testOTPMessage) {
            testOTPMessage.innerHTML = `<strong>Test OTP (for demo): ${generatedOTP}</strong>`;
            testOTPMessage.style.display = 'block';
        }
        
        setTimeout(() => {
            resendBtn.textContent = originalText;
            startOTPTimer();
            clearOTPInputs();
            focusOTPInput();
            showToastMessage('New OTP has been sent!');
        }, 1500);
    }

    // ====== LOGIN HANDLER ======
    function handleLogin(e) {
        e.preventDefault();
        console.log('Login form submitted, currentTab:', currentTab);
        
        let username, password;
        
        if (currentTab === 'username') {
            username = document.getElementById('username').value.trim();
            password = document.getElementById('username-password').value;
        } else {
            username = document.getElementById('phone').value.trim();
            password = document.getElementById('phone-password').value;
        }
        
        if (!username) {
            const errorId = currentTab === 'username' ? 'username-error' : 'phone-error';
            showError(errorId, `Please enter your ${currentTab}`);
            return;
        }
        
        if (!password) {
            const errorId = currentTab === 'username' ? 'username-password-error' : 'phone-password-error';
            showError(errorId, 'Please enter your password');
            return;
        }
        
        let submitBtn;
        if (currentTab === 'username') {
            submitBtn = e.target.querySelector('.username-login-btn');
        } else {
            submitBtn = e.target.querySelector('.phone-login-btn');
        }
        
        if (submitBtn) {
            const originalHTML = submitBtn.innerHTML;
            submitBtn.innerHTML = '<div class="loader small"></div>';
            submitBtn.disabled = true;
            
            setTimeout(() => {
                submitBtn.innerHTML = originalHTML;
                submitBtn.disabled = false;
                
                userData.isLoggedIn = true;
                userData.name = username;
                saveUserData();
                showPage('products');
                showToastMessage('Login successful!');
            }, 1500);
        }
    }

    // ====== SIGNUP HANDLER ======
    function handleSignup(e) {
        e.preventDefault();
        
        const fullname = document.getElementById('fullname').value.trim();
        const email = document.getElementById('email').value.trim();
        const username = document.getElementById('signup-username').value.trim();
        const phone = document.getElementById('signup-phone').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const terms = document.getElementById('terms').checked;
        
        let isValid = true;
        
        clearErrors();
        
        if (!fullname) {
            showError('name-error', 'Please enter your full name');
            isValid = false;
        } else if (fullname.length < 2) {
            showError('name-error', 'Name must be at least 2 characters');
            isValid = false;
        }
        
        if (!email) {
            showError('email-error', 'Please enter email address');
            isValid = false;
        } else if (!validateEmail(email)) {
            showError('email-error', 'Please enter a valid email address');
            isValid = false;
        }
        
        if (!username) {
            showError('signup-username-error', 'Please choose a username');
            isValid = false;
        } else if (username.length < 3) {
            showError('signup-username-error', 'Username must be at least 3 characters');
            isValid = false;
        }
        
        if (!phone) {
            showError('signup-phone-error', 'Please enter phone number');
            isValid = false;
        } else if (!validatePhone(phone)) {
            showError('signup-phone-error', 'Please enter a valid phone number');
            isValid = false;
        }
        
        if (!password) {
            showError('password-error', 'Please create a password');
            isValid = false;
        } else if (password.length < 6) {
            showError('password-error', 'Password must be at least 6 characters');
            isValid = false;
        }
        
        if (!confirmPassword) {
            showError('confirm-password-error', 'Please confirm your password');
            isValid = false;
        } else if (password !== confirmPassword) {
            showError('confirm-password-error', 'Passwords do not match');
            isValid = false;
        }
        
        if (!terms) {
            showError('terms-error', 'Please accept the terms and conditions');
            isValid = false;
        }
        
        if (!isValid) return;
        
        const submitBtn = e.target.querySelector('#signup-btn');
        showLoading(submitBtn, true);
        
        setTimeout(() => {
            showLoading(submitBtn, false);
            
            userData.isLoggedIn = true;
            userData.name = fullname;
            userData.email = email;
            userData.phone = phone;
            
            saveUserData();
            showPage('products');
            showToastMessage('Account created successfully!');
            
        }, 2000);
    }

    // ====== SOCIAL LOGIN ======
    function handleSocialLogin(e) {
        const platform = e.currentTarget.classList.contains('google-btn') ? 'Google' : 'Facebook';
        const btn = e.currentTarget;
        
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<div class="loader small"></div>';
        btn.disabled = true;
        
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
            
            userData.isLoggedIn = true;
            userData.name = `${platform} User`;
            userData.email = `user@${platform.toLowerCase()}.com`;
            userData.phone = "9876543210";
            
            saveUserData();
            showPage('products');
            showToastMessage(`Logged in with ${platform}!`);
        }, 1500);
    }

    // ====== REMEMBER ME FUNCTIONALITY ======
    function rememberUser(username, type) {
        const userData = {
            username: username,
            type: type,
            timestamp: Date.now()
        };
        localStorage.setItem('organicMartUser', JSON.stringify(userData));
    }

    function clearRememberedUser() {
        localStorage.removeItem('organicMartUser');
    }

    function checkRememberedUser() {
        const saved = localStorage.getItem('organicMartUser');
        if (saved) {
            try {
                const userData = JSON.parse(saved);
                const oneWeek = 7 * 24 * 60 * 60 * 1000;
                
                if (Date.now() - userData.timestamp < oneWeek) {
                    switchTab(userData.type);
                    document.getElementById(userData.type === 'username' ? 'username' : 'phone').value = userData.username;
                    const rememberCheckbox = document.getElementById(`remember-${userData.type}`);
                    if (rememberCheckbox) rememberCheckbox.checked = true;
                } else {
                    clearRememberedUser();
                }
            } catch (e) {
                clearRememberedUser();
            }
        }
    }

    // ====== HELPER FUNCTIONS ======
    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    function validatePhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        const re = /^[6-9]\d{9}$/;
        return re.test(cleaned) && cleaned.length === 10;
    }

    function showError(elementOrId, message) {
        const element = typeof elementOrId === 'string' ? 
            document.getElementById(elementOrId) : elementOrId;
        
        if (element) {
            element.textContent = message;
            element.style.display = 'block';
        }
    }

    function hideError(elementOrId) {
        const element = typeof elementOrId === 'string' ? 
            document.getElementById(elementOrId) : elementOrId;
        
        if (element) {
            element.style.display = 'none';
        }
    }

    function clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => {
            el.style.display = 'none';
            el.textContent = '';
        });
    }

    function clearForm(form) {
        if (form) {
            form.reset();
        }
    }

    function clearResetForm() {
        const resetInput = document.getElementById('reset-input');
        const newPassword = document.getElementById('new-password');
        const confirmNewPassword = document.getElementById('confirm-new-password');
        
        if (resetInput) resetInput.value = '';
        if (newPassword) newPassword.value = '';
        if (confirmNewPassword) confirmNewPassword.value = '';
        
        clearOTPInputs();
        clearErrors();
        
        const testOTPMessage = document.getElementById('test-otp-message');
        if (testOTPMessage) {
            testOTPMessage.style.display = 'none';
        }
    }

    function clearOTPInputs() {
        document.querySelectorAll('.otp-input').forEach(input => {
            input.value = '';
        });
        checkOTPCompletion();
    }

    function focusOTPInput() {
        const firstOtpInput = document.getElementById('otp1');
        if (firstOtpInput) {
            setTimeout(() => firstOtpInput.focus(), 100);
        }
    }

    function showLoading(button, show) {
        if (!button) return;
        
        const btnText = button.querySelector('.btn-text');
        const btnLoader = button.querySelector('.btn-loader');
        
        if (show) {
            if (btnText) btnText.style.visibility = 'hidden';
            if (btnLoader) btnLoader.style.display = 'block';
            button.disabled = true;
        } else {
            if (btnText) btnText.style.visibility = 'visible';
            if (btnLoader) btnLoader.style.display = 'none';
            button.disabled = false;
        }
    }

    function maskEmail(email) {
        const [local, domain] = email.split('@');
        if (local.length <= 2) return email;
        return local.charAt(0) + '*'.repeat(local.length - 2) + local.charAt(local.length - 1) + '@' + domain;
    }

    function maskPhone(phone) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length <= 4) return phone;
        return '******' + digits.slice(-4);
    }

    // ====== FORM VALIDATION UTILITIES ======
    function setupRealTimeValidation() {
        const usernameInput = document.getElementById('username');
        if (usernameInput) {
            usernameInput.addEventListener('blur', function() {
                if (this.value.trim() && this.value.trim().length < 3) {
                    showError('username-error', 'Username must be at least 3 characters');
                } else {
                    hideError('username-error');
                }
            });
        }
        
        const emailInput = document.getElementById('email');
        if (emailInput) {
            emailInput.addEventListener('blur', function() {
                if (this.value.trim() && !validateEmail(this.value.trim())) {
                    showError('email-error', 'Please enter a valid email');
                } else {
                    hideError('email-error');
                }
            });
        }
        
        const phoneInput = document.getElementById('phone');
        if (phoneInput) {
            phoneInput.addEventListener('blur', function() {
                if (this.value.trim() && !validatePhone(this.value.trim())) {
                    showError('phone-error', 'Please enter a valid phone number');
                } else {
                    hideError('phone-error');
                }
            });
        }
        
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        passwordInputs.forEach(input => {
            input.addEventListener('input', function() {
                if (this.value.length > 0 && this.value.length < 6) {
                    const errorId = this.id === 'password' ? 'password-error' : 
                                  this.id === 'new-password' ? 'new-password-error' :
                                  `${currentTab}-password-error`;
                    showError(errorId, 'Password must be at least 6 characters');
                } else {
                    hideError(`${currentTab}-password-error`);
                }
            });
        });
    }

    function preventLoginPageScroll() {
        const loginPage = document.getElementById('login-page');
        if (loginPage) {
            loginPage.style.overflow = 'hidden';
            loginPage.style.height = '100vh';
        }
        
        const signupPage = document.getElementById('signup-page');
        if (signupPage) {
            signupPage.style.overflow = 'auto';
            signupPage.style.height = 'auto';
        }
    }

    function initializePages() {
        console.log('Initializing pages...');
        
        Object.keys(pages).forEach(key => {
            if (pages[key]) {
                pages[key].style.display = 'none';
                pages[key].classList.remove('active');
                console.log(`Removed active class from ${key}`);
            }
        });
        
        Object.keys(pages).forEach(key => {
            if (pages[key] && pages[key].classList.contains('active')) {
                console.warn(`Page ${key} still has active class after initialization!`);
                pages[key].classList.remove('active');
            }
        });
    }

    function loadUserData() {
        const savedData = localStorage.getItem('organicMartUserData');
        if (savedData) {
            try {
                userData = JSON.parse(savedData);
                console.log('User data loaded:', userData);
            } catch (e) {
                console.error('Error loading user data:', e);
                userData = {
                    isLoggedIn: false,
                    name: '',
                    email: '',
                    phone: '',
                    addresses: [],
                    orders: [],
                    wishlist: [],
                    cart: []
                };
            }
        }
        
        if (userData.addresses && userData.addresses.length === 0) {
            userData.addresses = Object.values(sampleAddresses);
            saveUserData();
        }
        
        if (!userData.cart) {
            userData.cart = [];
        }
        
        if (!userData.orders) {
            userData.orders = [];
        }
        
        // Update window.userData
        window.userData = userData;
    }

    function saveUserData() {
        try {
            localStorage.setItem('organicMartUserData', JSON.stringify(userData));
            console.log('User data saved');
            
            // Update window.userData
            window.userData = userData;
        } catch (e) {
            console.error('Error saving user data:', e);
        }
    }

    function checkLoginStatus() {
        console.log('Checking login status:', userData.isLoggedIn);
        
        if (userData.isLoggedIn) {
            showPage('products');
        } else {
            showPage('login');
        }
    }

    function showPage(pageName) {
        console.log('Showing page:', pageName);
        
        // Hide all main pages
        Object.keys(pages).forEach(key => {
            if (pages[key]) {
                pages[key].style.display = 'none';
                pages[key].classList.remove('active');
            }
        });
        
        // Hide all info pages
        document.querySelectorAll('.info-page').forEach(page => {
            page.style.display = 'none';
        });
        
        // Show selected page
        if (pages[pageName]) {
            pages[pageName].style.display = pageName === 'login' || pageName === 'signup' ? 'flex' : 'block';
            pages[pageName].classList.add('active');
            
            // Reset order ID when leaving checkout page (except when going to confirmation)
            if (pageName !== 'checkout' && pageName !== 'confirmation') {
                resetOrderId();
            }
            
            window.scrollTo(0, 0);
            
            initializePageContent(pageName);
            
            console.log(`Page ${pageName} shown successfully`);
        } else {
            console.error(`Page ${pageName} not found`);
        }
    }

    function initializePageContent(pageName) {
        console.log('Initializing content for:', pageName);
        switch(pageName) {
            case 'products':
                updateCartCount();
                updateUserProfile();
                initializeLazyLoading();
                initializeProductQuantitySelectors();
                setupProductFilters();
                setupNavigationMenu();
                setupHeroButtons();
                setupCategoryCards();
                setupShopNowButtons();
                setupLearnMoreButtons();
                setupOurStoryButton();
                setupNewsletter();
                setupFooterLinks();
                initializeCategoryFilters();
                break;
            case 'profile':
                loadProfileData();
                initializeProfileEvents();
                initReviewsSection();
                break;
            case 'cart':
                renderCart();
                setupCartEventListeners();
                break;
            case 'checkout':
                initializeCheckout();
                initializeCheckoutSteps();
                break;
            case 'confirmation':
                initializeOrderConfirmation();
                break;
            case 'login':
                initializeLoginPage();
                break;
            case 'signup':
                initializeSignupPage();
                break;
        }
    }

    // ===== SETUP ALL NAVIGATION BUTTONS =====
  function setupNavigationMenu() {
    const navLinks = document.querySelectorAll('nav ul li a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const linkText = this.textContent.trim();
            
            switch(linkText) {
                case 'Home':
                    showPage('products');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    break;
                    
                case 'Shop':
                    showPage('products');
                    setTimeout(() => {
                        const productsGrid = document.querySelector('.products-grid');
                        if (productsGrid) {
                            const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                            const elementPosition = productsGrid.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                            window.scrollTo({
                                top: offsetPosition,
                                behavior: 'smooth'
                            });
                        }
                    }, 100);
                    break;
                    
                case 'Categories':
                    showPage('products');
                    
                    // Increased timeout to ensure page is fully loaded
                    setTimeout(() => {
                        // First, try to find the categories heading
                        const categoriesHeading = Array.from(document.querySelectorAll('h2, h3')).find(heading => 
                            heading.textContent.includes('Shop by Category') || 
                            heading.textContent.includes('Categories') ||
                            heading.textContent.includes('Our Categories')
                        );
                        
                        if (categoriesHeading) {
                            const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                            const elementPosition = categoriesHeading.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 30;
                            
                            window.scrollTo({
                                top: offsetPosition,
                                behavior: 'smooth'
                            });         
                            let categoriesSection = null;
                            for (const selector of categorySelectors) {
                                categoriesSection = document.querySelector(selector);
                                if (categoriesSection) break;
                            }
                            
                            if (categoriesSection) {
                                const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                                const elementPosition = categoriesSection.getBoundingClientRect().top;
                                const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                                
                                window.scrollTo({
                                    top: offsetPosition,
                                    behavior: 'smooth'
                                });
                              
                                if (categoryCards.length > 0) {
                                    const firstCard = categoryCards[0];
                                    const container = firstCard.closest('section, div');
                                    
                                    if (container) {
                                        const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                                        const elementPosition = container.getBoundingClientRect().top;
                                        const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                                        
                                        window.scrollTo({
                                            top: offsetPosition,
                                            behavior: 'smooth'
                                        });
                                    }
                                } else {
                                    // Fallback to products grid
                                    const productsGrid = document.querySelector('.products-grid');
                                    if (productsGrid) {
                                        const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                                        const elementPosition = productsGrid.getBoundingClientRect().top;
                                        const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                                        
                                        window.scrollTo({
                                            top: offsetPosition,
                                            behavior: 'smooth'
                                        });
                                        
                                        showToastMessage('Categories section not found. Scroll down to browse products.');
                                    }
                                }
                            }
                        }
                    }, 300); // Increased timeout for reliability
                    break;
                    
                case 'About':
                    showPage('products');
                    setTimeout(() => {
                        const about = document.querySelector('.about');
                        if (about) {
                            const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                            const elementPosition = about.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                            window.scrollTo({
                                top: offsetPosition,
                                behavior: 'smooth'
                            });
                        }
                    }, 100);
                    break;
                    
                case 'Contact':
                    showPage('products');
                    setTimeout(() => {
                        const footer = document.querySelector('footer');
                        if (footer) {
                            const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                            const elementPosition = footer.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                            window.scrollTo({
                                top: offsetPosition,
                                behavior: 'smooth'
                            });
                        }
                    }, 100);
                    break;
            }
        });
    });
}
    function setupHeroButtons() {
        const heroShopNow = document.querySelector('.hero-buttons .btn:first-child');
        if (heroShopNow) {
            heroShopNow.addEventListener('click', function(e) {
                e.preventDefault();
                showPage('products');
                setTimeout(() => {
                    const productsGrid = document.querySelector('.products-grid');
                    if (productsGrid) {
                        const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                        const elementPosition = productsGrid.getBoundingClientRect().top;
                        const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                        window.scrollTo({
                            top: offsetPosition,
                            behavior: 'smooth'
                        });
                    }
                }, 100);
            });
        }

        const heroLearnMore = document.querySelector('.hero-buttons .btn:nth-child(2)');
        if (heroLearnMore) {
            heroLearnMore.addEventListener('click', function(e) {
                e.preventDefault();
                showPage('products');
                setTimeout(() => {
                    const about = document.querySelector('.about');
                    if (about) {
                        const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                        const elementPosition = about.getBoundingClientRect().top;
                        const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                        window.scrollTo({
                            top: offsetPosition,
                            behavior: 'smooth'
                        });
                    }
                }, 100);
            });
        }
    }

    function setupCategoryCards() {
        const categoryCards = document.querySelectorAll('.category-card');
        categoryCards.forEach(card => {
            card.addEventListener('click', function(e) {
                e.preventDefault();
                showPage('products');
                
                const categoryName = this.querySelector('h3').textContent.trim();
                
                setTimeout(() => {
                    filterCategories(categoryName);
                    
                    const productsGrid = document.querySelector('.products-grid');
                    if (productsGrid) {
                        const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                        const elementPosition = productsGrid.getBoundingClientRect().top;
                        const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                        window.scrollTo({
                            top: offsetPosition,
                            behavior: 'smooth'
                        });
                    }
                }, 100);
            });
        });
    }

    function setupShopNowButtons() {
        const shopNowButtons = document.querySelectorAll('.btn:not(.hero-buttons .btn)');
        shopNowButtons.forEach(btn => {
            if (btn.textContent.includes('Shop Now') || btn.textContent.includes('Start Shopping')) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    showPage('products');
                });
            }
        });
    }

    function setupLearnMoreButtons() {
        const learnMoreButtons = document.querySelectorAll('.btn');
        learnMoreButtons.forEach(btn => {
            if (btn.textContent.includes('Learn More')) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    showPage('products');
                    setTimeout(() => {
                        const about = document.querySelector('.about');
                        if (about) {
                            const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                            const elementPosition = about.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                            window.scrollTo({
                                top: offsetPosition,
                                behavior: 'smooth'
                            });
                        }
                    }, 100);
                });
            }
        });
    }

    function setupOurStoryButton() {
        const ourStoryBtn = document.querySelector('button.btn');
        
        if (ourStoryBtn && ourStoryBtn.textContent.trim() === 'Our Story') {
            ourStoryBtn.addEventListener('click', function(e) {
                e.preventDefault();
                showOurStoryPage();
            });
        }
    }

    // Add this new function to show the Our Story page
    window.showOurStoryPage = function() {
        // Check if Our Story page already exists in the DOM
        let ourStoryPage = document.getElementById('our-story-page');
        
        if (!ourStoryPage) {
            // Create the Our Story page if it doesn't exist
            ourStoryPage = document.createElement('div');
            ourStoryPage.id = 'our-story-page';
            ourStoryPage.className = 'info-page'; // Use same class as other info pages
            
            // Get the story content
            const storyContent = document.getElementById('storyContent');
            const storyText = storyContent ? storyContent.innerText || storyContent.textContent : '';
            
            // Create the HTML structure
            ourStoryPage.innerHTML = `
                <div class="info-container">
                    <div class="info-header">
                        <h1>Our Story</h1>
                        <button class="btn-back" onclick="showPage('products')">
                            <i class="fas fa-arrow-left"></i> Back to Shopping
                        </button>
                    </div>
                    <div class="info-content our-story-content">
                        ${storyText.split('\n').map(para => `<p>${para}</p>`).join('')}
                    </div>
                    <div class="info-footer">
                        <button class="btn-primary" onclick="showPage('products')">
                            <i class="fas fa-shopping-bag"></i> Continue Shopping
                        </button>
                    </div>
                </div>
            `;
          
            // Insert after the checkout page or at the end of body
            const checkoutPage = document.getElementById('checkout-page');
            if (checkoutPage) {
                checkoutPage.insertAdjacentElement('afterend', ourStoryPage);
            } else {
                document.body.appendChild(ourStoryPage);
            }
        }
        
        // Hide all other pages
        const pages = ['login-page', 'signup-page', 'products-page', 'profile-page', 'cart-page', 'checkout-page', 'confirmation-page'];
        pages.forEach(pageId => {
            const page = document.getElementById(pageId);
            if (page) {
                page.style.display = 'none';
                page.classList.remove('active');
            }
        });
        
        // Hide all other info pages
        document.querySelectorAll('.info-page').forEach(page => {
            if (page.id !== 'our-story-page') {
                page.style.display = 'none';
            }
        });
        
        // Show Our Story page
        ourStoryPage.style.display = 'block';
        window.scrollTo(0, 0);
    };

    // Add this to your initializeInfoPages function
    function initializeInfoPages() {
        console.log('Initializing info pages...');
        
        // Hide all info pages initially
        document.querySelectorAll('.info-page').forEach(page => {
            page.style.display = 'none';
        });
        
        // Setup footer links for info pages
        setupInfoPageLinks();
        
        // Initialize FAQ functionality
        initializeFAQ();
        
        // Setup Our Story button
        setupOurStoryButton(); // Add this line
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupOurStoryButton);
    } else {
        setupOurStoryButton();
    }

    function setupNewsletter() {
        const newsletterForm = document.querySelector('.newsletter-form');
        if (newsletterForm) {
            newsletterForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const emailInput = this.querySelector('input[type="email"]');
                const email = emailInput.value.trim();
                
                if (email && validateEmail(email)) {
                    showToastMessage(`Thank you for subscribing with ${email}! You'll receive updates on new products and offers.`);
                    emailInput.value = '';
                } else {
                    showToastMessage('Please enter a valid email address.');
                }
            });
        }
    }

function setupFooterLinks() {
    const footerLinks = document.querySelectorAll('.footer-col ul li a');
    footerLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const linkText = this.textContent.trim();
            
            switch(linkText) {
                case 'Home':
                    showPage('products');
                    break;
                case 'Shop':
                    showPage('products');
                    setTimeout(() => {
                        const productsGrid = document.querySelector('.products-grid');
                        if (productsGrid) {
                            const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                            const elementPosition = productsGrid.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                            window.scrollTo({
                                top: offsetPosition,
                                behavior: 'smooth'
                            });
                        }
                    }, 100);
                    break;
                case 'About Us':
                    showPage('products');
                    setTimeout(() => {
                        const about = document.querySelector('.about');
                        if (about) {
                            const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                            const elementPosition = about.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                            window.scrollTo({
                                top: offsetPosition,
                                behavior: 'smooth'
                            });
                        }
                    }, 100);
                    break;
                case 'Blog':
                    showToastMessage('Blog section coming soon!');
                    break;
                case 'Contact':
                    showPage('products');
                    setTimeout(() => {
                        const footer = document.querySelector('footer');
                        if (footer) {
                            const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                            const elementPosition = footer.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
                            window.scrollTo({
                                top: offsetPosition,
                                behavior: 'smooth'
                            });
                        }
                    }, 100);
                    break;
                case 'My Account':
                    if (userData.isLoggedIn) {
                        showPage('profile');
                    } else {
                        showPage('login');
                    }
                    break;
                case 'My Orders': // Changed from 'Order Tracking' to 'My Orders'
                    if (userData.isLoggedIn) {
                        showPage('profile');
                        setTimeout(() => {
                            // Switch to orders tab
                            const ordersTab = document.querySelector('.profile-nav-item[data-tab="orders"]');
                            if (ordersTab) {
                                ordersTab.click();
                                
                                // Scroll to orders section
                                const ordersSection = document.getElementById('orders');
                                if (ordersSection) {
                                    ordersSection.scrollIntoView({ behavior: 'smooth' });
                                }
                            }
                        }, 100);
                    } else {
                        alert('Please login to view your orders.');
                        showPage('login');
                    }
                    break;
                case 'Delivery Information':
                    showInfoPage('delivery-info-page');
                    break;
                case 'Returns Policy':
                    showInfoPage('returns-policy-page');
                    break;
                case 'FAQs':
                    showInfoPage('faqs-page');
                    break;
            }
        });
    });
    
    const socialLinks = document.querySelectorAll('.social-links a');
    socialLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const platform = this.querySelector('i').className.includes('facebook') ? 'Facebook' :
                           this.querySelector('i').className.includes('instagram') ? 'Instagram' :
                           this.querySelector('i').className.includes('twitter') ? 'Twitter' : 'YouTube';
            showToastMessage(`Opening ${platform} page in a new window. (Demo)`);
        });
    });
}
    function initializeProductQuantitySelectors() {
        const quantitySelects = document.querySelectorAll('.quantity-select');
        console.log(`Found ${quantitySelects.length} quantity selects to initialize`);
        
        quantitySelects.forEach(select => {
            const productId = parseInt(select.getAttribute('data-product-id'));
            if (!productId) {
                console.error('Missing data-product-id on quantity select');
                return;
            }
            
            if (!productDatabase[productId]) {
                console.error(`Product ID ${productId} not found in database`);
                return;
            }
            
            updateProductPrice(select);
            
            select.addEventListener('change', function() {
                updateProductPrice(this);
            });
        });
    }

    function setupProductFilters() {
        const categoryFilters = document.querySelectorAll('.category-filter');
        const sortSelect = document.getElementById('sort-products');
        
        if (categoryFilters.length > 0) {
            categoryFilters.forEach(filter => {
                filter.addEventListener('click', function() {
                    const category = this.getAttribute('data-category');
                    filterProductsByCategory(category);
                });
            });
        }
        
        if (sortSelect) {
            sortSelect.addEventListener('change', function() {
                sortProducts(this.value);
            });
        }
        
        const searchInput = document.querySelector('.search-bar input');
        if (searchInput) {
            // Remove any existing listeners and add new one
            const newSearchInput = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearchInput, searchInput);
            
            newSearchInput.addEventListener('input', function() {
                searchProducts(this.value);
            });
        }
    }

    function filterProductsByCategory(category) {
        console.log(`Filtering products by category: ${category}`);
        
        const productCards = document.querySelectorAll('.product-card');
        const categoryFilters = document.querySelectorAll('.category-filter');
        
        categoryFilters.forEach(filter => {
            filter.classList.remove('active');
            if (filter.getAttribute('data-category') === category) {
                filter.classList.add('active');
            }
        });
        
        productCards.forEach(card => {
            const productId = parseInt(card.getAttribute('data-product-id'));
            const product = productDatabase[productId];
            
            if (category === 'all' || product.category === category) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
        
        // Show all category headings when filtering by category
        const allHeadings = document.querySelectorAll('.categories h2, .categories h3, .section-title, .category-section h2, .category-section h3');
        allHeadings.forEach(heading => {
            heading.style.display = 'block';
            heading.style.visibility = 'visible';
            heading.style.opacity = '1';
        });
        
        const categoryTitle = document.querySelector('.category-title');
        if (categoryTitle) {
            if (category === 'all') {
                categoryTitle.textContent = 'All Products';
            } else {
                categoryTitle.textContent = `${category} Products`;
            }
        }
        
        const productCount = document.querySelector('.product-count');
        if (productCount) {
            const visibleCount = document.querySelectorAll('.product-card[style="display: block"]').length;
            productCount.textContent = `${visibleCount} products`;
        }
        
        showToastMessage(`Showing ${category === 'all' ? 'all' : category} products`);
    }

    function sortProducts(sortBy) {
        const productsContainer = document.querySelector('.products-grid');
        const productCards = Array.from(document.querySelectorAll('.product-card'));
        
        switch(sortBy) {
            case 'price-low-high':
                productCards.sort((a, b) => {
                    const priceA = parseInt(a.querySelector('.current-price').textContent.replace('₹', ''));
                    const priceB = parseInt(b.querySelector('.current-price').textContent.replace('₹', ''));
                    return priceA - priceB;
                });
                break;
            case 'price-high-low':
                productCards.sort((a, b) => {
                    const priceA = parseInt(a.querySelector('.current-price').textContent.replace('₹', ''));
                    const priceB = parseInt(b.querySelector('.current-price').textContent.replace('₹', ''));
                    return priceB - priceA;
                });
                break;
            case 'name-a-z':
                productCards.sort((a, b) => {
                    const nameA = a.querySelector('h3').textContent.toLowerCase();
                    const nameB = b.querySelector('h3').textContent.toLowerCase();
                    return nameA.localeCompare(nameB);
                });
                break;
            case 'name-z-a':
                productCards.sort((a, b) => {
                    const nameA = a.querySelector('h3').textContent.toLowerCase();
                    const nameB = b.querySelector('h3').textContent.toLowerCase();
                    return nameB.localeCompare(nameA);
                });
                break;
            case 'discount':
                productCards.sort((a, b) => {
                    const discountA = parseInt(a.querySelector('.discount').textContent.replace('% off', '')) || 0;
                    const discountB = parseInt(b.querySelector('.discount').textContent.replace('% off', '')) || 0;
                    return discountB - discountA;
                });
                break;
        }
        
        productCards.forEach(card => {
            productsContainer.appendChild(card);
        });
        
        showToastMessage(`Sorted by ${sortBy.replace('-', ' ')}`);
    }

    function updateProductPrice(selectElement) {
        const productId = parseInt(selectElement.getAttribute('data-product-id'));
        const selectedValue = parseInt(selectElement.value);
        const productCard = selectElement.closest('.product-card');
        
        console.log(`Updating price for product ${productId}, quantity option ${selectedValue}`);
        
        if (!productDatabase[productId]) {
            console.error(`Product ID ${productId} not found in database`);
            return;
        }
        
        const product = productDatabase[productId];
        
        if (!product.prices[selectedValue]) {
            console.error(`Price not found for quantity option ${selectedValue} for product ${productId}`);
            return;
        }
        
        const selectedPrice = product.prices[selectedValue];
        const originalPrice = product.originalPrice;
        const discount = product.discount;
        
        const discountMultiplier = 1 - (discount / 100);
        const selectedOriginalPrice = Math.round(selectedPrice / discountMultiplier);
        
        const currentPriceElement = productCard.querySelector('.current-price');
        const originalPriceElement = productCard.querySelector('.original-price');
        const discountElement = productCard.querySelector('.discount');
        
        if (currentPriceElement) {
            currentPriceElement.textContent = `₹${selectedPrice}`;
        }
        
        if (originalPriceElement) {
            originalPriceElement.textContent = `₹${selectedOriginalPrice}`;
        }
        
        if (discountElement) {
            discountElement.textContent = `${discount}% off`;
        }
        
        console.log(`Price updated: Current=₹${selectedPrice}, Original=₹${selectedOriginalPrice}, Discount=${discount}%`);
    }

    function initializeLoginPage() {
        console.log('Initializing login page...');
        
        switchTab('username');
        
        const otpSection = document.getElementById('otp-section');
        const getOtpBtn = document.getElementById('get-otp-btn');
        const loginBtn = document.getElementById('login-btn');
        
        if (otpSection) otpSection.style.display = 'none';
        if (getOtpBtn) getOtpBtn.style.display = 'block';
        if (loginBtn) loginBtn.style.display = 'none';
        
        const otpInputs = document.querySelectorAll('.otp-input');
        otpInputs.forEach(input => input.value = '');
        
        document.querySelectorAll('.error-message').forEach(error => {
            error.textContent = '';
            error.style.display = 'none';
        });
    }

    function initializeSignupPage() {
        console.log('Initializing signup page...');
        const signupForm = document.getElementById('signup-form');
        if (signupForm) signupForm.reset();
        
        document.querySelectorAll('.error-message').forEach(error => {
            error.textContent = '';
            error.style.display = 'none';
        });
    }

    function setupEventListeners() {
        console.log('Setting up event listeners...');
        setupLoginEvents();
        setupSignupEvents();
        setupNavigationEvents();
        setupProductEvents();
        setupModalEvents();
        setupLazyLoading();
        setupCouponEvents();
        setupCheckoutEvents();
        setupUPIPaymentEvents();
        setupFeedbackEvents();
        setupEmptyCartButtons(); // Add this line
    }

    // ===== LOGIN FUNCTIONALITY =====
    function setupLoginEvents() {
        const showSignupLink = document.getElementById('show-signup');
        const loginForm = document.getElementById('login-form');
        const getOtpBtn = document.getElementById('get-otp-btn');
        const loginBtn = document.getElementById('login-btn');
        const otpInputs = document.querySelectorAll('.otp-input');
        const resendOtpLink = document.getElementById('resend-otp');
        const socialLoginBtns = document.querySelectorAll('.social-btn');

        console.log('Login events setup:', {
            showSignupLink: !!showSignupLink,
            loginForm: !!loginForm,
            getOtpBtn: !!getOtpBtn,
            loginBtn: !!loginBtn,
            otpInputs: otpInputs.length
        });

        if (showSignupLink) {
            showSignupLink.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Switching to signup page');
                showPage('signup');
            });
        }

        if (getOtpBtn) {
            getOtpBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Get OTP clicked');
                
                const activeTabBtn = document.querySelector('.tab-btn.active');
                const currentTab = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'username';
                let isValid = false;
                let identifier = '';
                
                if (currentTab === 'phone') {
                    const phoneInput = document.getElementById('phone');
                    identifier = phoneInput.value.trim();
                    if (validatePhone(identifier)) {
                        isValid = true;
                        simulateOtpSend('phone');
                    } else {
                        showError('phone-error', 'Please enter a valid phone number (10 digits)');
                    }
                } else {
                    const emailInput = document.getElementById('email');
                    identifier = emailInput.value.trim();
                    if (validateEmail(identifier)) {
                        isValid = true;
                        simulateOtpSend('email');
                    } else {
                        showError('email-error', 'Please enter a valid email address');
                    }
                }
                
                if (isValid) {
                    showOtpSection();
                }
            });
        }

        otpInputs.forEach((input, index) => {
            input.addEventListener('input', function() {
                if (this.value && !/^\d$/.test(this.value)) {
                    this.value = '';
                    return;
                }
                
                if (this.value.length === 1 && index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
                
                const allFilled = Array.from(otpInputs).every(input => input.value.length === 1);
                if (allFilled) {
                    if (loginBtn) {
                        loginBtn.style.display = 'block';
                        loginBtn.disabled = false;
                    }
                }
            });
            
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Backspace' && this.value === '' && index > 0) {
                    otpInputs[index - 1].focus();
                }
            });
        });

        if (resendOtpLink) {
            resendOtpLink.addEventListener('click', function(e) {
                e.preventDefault();
                simulateOtpSend();
            });
        }

        socialLoginBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const provider = this.classList.contains('google-btn') ? 'Google' : 'Facebook';
                simulateSocialLogin(provider);
            });
        });

        if (loginForm) {
            loginForm.addEventListener('submit', function(e) {
                e.preventDefault();
                handleLogin(e);
            });
        }

        document.addEventListener('click', function(e) {
            if (e.target.id === 'login-btn' || e.target.closest('#login-btn')) {
                e.preventDefault();
                console.log('Login button clicked');
                
                let username, password;
                
                if (currentTab === 'username') {
                    username = document.getElementById('username').value.trim();
                    password = document.getElementById('username-password').value;
                } else {
                    username = document.getElementById('phone').value.trim();
                    password = document.getElementById('phone-password').value;
                }
                
                if (!username) {
                    const errorId = currentTab === 'username' ? 'username-error' : 'phone-error';
                    showError(errorId, `Please enter your ${currentTab}`);
                    return;
                }
                
                if (!password) {
                    const errorId = currentTab === 'username' ? 'username-password-error' : 'phone-password-error';
                    showError(errorId, 'Please enter your password');
                    return;
                }
                
                const loginBtn = document.getElementById('login-btn');
                if (loginBtn) {
                    const originalHTML = loginBtn.innerHTML;
                    loginBtn.innerHTML = '<div class="loader small"></div>';
                    loginBtn.disabled = true;
                    
                    setTimeout(() => {
                        loginBtn.innerHTML = originalHTML;
                        loginBtn.disabled = false;
                        
                        userData.isLoggedIn = true;
                        userData.name = username;
                        saveUserData();
                        showPage('products');
                        showToastMessage('Login successful!');
                    }, 1500);
                }
            }
            
            if (e.target.classList.contains('username-login-btn') || e.target.classList.contains('phone-login-btn')) {
                e.preventDefault();
                console.log('Tab-specific login button clicked');
                
                const isUsernameTab = e.target.classList.contains('username-login-btn');
                const tabType = isUsernameTab ? 'username' : 'phone';
                
                currentTab = tabType;
                
                const loginForm = document.getElementById('login-form');
                if (loginForm) {
                    loginForm.dispatchEvent(new Event('submit'));
                }
            }
        });
    }

    // ===== SIGNUP FUNCTIONALITY =====
    function setupSignupEvents() {
        const showLoginLink = document.getElementById('show-login');
        const signupForm = document.getElementById('signup-form');
        const socialSignupBtns = document.querySelectorAll('#signup-page .social-btn');

        if (showLoginLink) {
            showLoginLink.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Switching to login page');
                showPage('login');
            });
        }

        socialSignupBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const provider = this.classList.contains('google-btn') ? 'Google' : 'Facebook';
                simulateSocialLogin(provider);
            });
        });

        if (signupForm) {
            signupForm.addEventListener('submit', function(e) {
                e.preventDefault();
                handleSignup(e);
            });
        }
    }

    // ===== NAVIGATION FUNCTIONALITY =====
    function setupNavigationEvents() {
        const userIcon = document.getElementById('user-icon');
        if (userIcon) {
            userIcon.addEventListener('click', function(e) {
                e.preventDefault();
                if (userData.isLoggedIn) {
                    showPage('profile');
                } else {
                    showPage('login');
                }
            });
        }

        const cartIcon = document.querySelector('.cart-icon');
        if (cartIcon) {
            cartIcon.addEventListener('click', function(e) {
                e.preventDefault();
                showPage('cart');
            });
        }

        const profileCartIcon = document.getElementById('profile-cart-icon');
        if (profileCartIcon) {
            profileCartIcon.addEventListener('click', function(e) {
                e.preventDefault();
                showPage('cart');
            });
        }

        const cartUserIcon = document.getElementById('cart-user-icon');
        if (cartUserIcon) {
            cartUserIcon.addEventListener('click', function(e) {
                e.preventDefault();
                showPage('profile');
            });
        }

        const backToProductsBtns = document.querySelectorAll('#back-to-products, #cart-back-to-products, #checkout-back-to-cart, #empty-cart-shop, #start-shopping, #browse-products, #continue-shopping');
        backToProductsBtns.forEach(btn => {
            if (btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    showPage('products');
                });
            }
        });

        const searchForm = document.querySelector('.search-form');
        if (searchForm) {
            searchForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const searchInput = this.querySelector('.search-input');
                const searchTerm = searchInput.value.trim();
                
                if (searchTerm) {
                    showPage('products');
                    setTimeout(() => {
                        searchProducts(searchTerm);
                        searchInput.value = searchTerm;
                        showToastMessage(`Search results for: ${searchTerm}`);
                    }, 100);
                }
            });
        }
    }

    // ===== PRODUCT FUNCTIONALITY =====
    function setupProductEvents() {
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('add-to-cart')) {
                const productCard = e.target.closest('.product-card');
                if (productCard) {
                    const productId = parseInt(productCard.getAttribute('data-product-id'));
                    const quantitySelect = productCard.querySelector('.quantity-select');
                    const selectedQuantity = parseInt(quantitySelect.value);
                    
                    addToCart(productId, selectedQuantity);
                }
            }
            
            if (e.target.classList.contains('wishlist-btn')) {
                const productCard = e.target.closest('.product-card');
                if (productCard) {
                    const productId = parseInt(productCard.getAttribute('data-product-id'));
                    addToWishlist(productId);
                }
            }
            
            if (e.target.classList.contains('quick-view-btn')) {
                const productCard = e.target.closest('.product-card');
                if (productCard) {
                    const productId = parseInt(productCard.getAttribute('data-product-id'));
                    showQuickView(productId);
                }
            }
        });
    }

    // ===== PROFILE FUNCTIONALITY =====
    function initializeProfileEvents() {
        const profileNavItems = document.querySelectorAll('.profile-nav-item');
        profileNavItems.forEach(item => {
            if (!item.classList.contains('logout-btn')) {
                item.addEventListener('click', function(e) {
                    e.preventDefault();
                    const tab = this.getAttribute('data-tab');
                    
                    profileNavItems.forEach(navItem => navItem.classList.remove('active'));
                    this.classList.add('active');
                    
                    const profileTabs = document.querySelectorAll('.profile-tab');
                    profileTabs.forEach(tabElement => tabElement.classList.remove('active'));
                    
                    const activeTab = document.getElementById(tab);
                    if (activeTab) {
                        activeTab.classList.add('active');
                    }
                });
            }
        });

        const logoutBtn = document.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                handleLogout();
            });
        }

        const profileForm = document.getElementById('profile-form');
        if (profileForm) {
            profileForm.addEventListener('submit', function(e) {
                e.preventDefault();
                saveProfile();
            });
        }

        const addAddressBtn = document.getElementById('add-new-address-btn');
        if (addAddressBtn) {
            addAddressBtn.addEventListener('click', function() {
                const addressFormContainer = document.getElementById('address-form-container');
                if (addressFormContainer) {
                    addressFormContainer.style.display = 'block';
                    const form = document.getElementById('address-form');
                    if (form) {
                        form.reset();
                    }
                }
            });
        }

        const cancelAddressBtn = document.getElementById('cancel-address-btn');
        if (cancelAddressBtn) {
            cancelAddressBtn.addEventListener('click', function() {
                const addressFormContainer = document.getElementById('address-form-container');
                if (addressFormContainer) {
                    addressFormContainer.style.display = 'none';
                }
            });
        }

        const saveAddressBtn = document.getElementById('save-address-btn');
        if (saveAddressBtn) {
            saveAddressBtn.addEventListener('click', function(e) {
                e.preventDefault();
                
                // Get form values
                const name = document.getElementById('delivery-name').value;
                const phone = document.getElementById('delivery-phone').value;
                const address = document.getElementById('delivery-address').value;
                const city = document.getElementById('delivery-city').value;
                const pincode = document.getElementById('delivery-pincode').value;
                const state = document.getElementById('delivery-state').value;
                const saveAddressCheckbox = document.getElementById('save-address').checked;
                
                // Validate form
                if (!name || !phone || !address || !city || !pincode || !state) {
                    alert('Please fill all address fields');
                    return;
                }
                
                // Validate phone
                const phoneDigits = phone.replace(/\D/g, '');
                if (phoneDigits.length !== 10) {
                    alert('Please enter a valid 10-digit phone number');
                    return;
                }
                
                // Create new address object
                const newAddress = {
                    id: Date.now(),
                    name: name,
                    fullName: name,
                    phone: phone,
                    street: address,
                    city: city,
                    pincode: pincode,
                    state: state,
                    default: false
                };
                
                // Add to userData
                if (!userData.addresses) {
                    userData.addresses = [];
                }
                userData.addresses.push(newAddress);
                
                // Save to localStorage
                saveUserData();
                
                // Hide the form
                const addressFormContainer = document.getElementById('address-form-container');
                if (addressFormContainer) {
                    addressFormContainer.style.display = 'none';
                }
                
                // Update addresses display
                renderAddresses();
                
                // Sync to checkout if checkout is active
                syncAddressesToCheckout();
                
                // Show success message
                showToastMessage('Address saved successfully!');
                
                // Reset form
                document.getElementById('address-form').reset();
            });
        }

        const modalCloseBtns = document.querySelectorAll('.modal-close, .modal-cancel');
        modalCloseBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                hideAddAddressModal();
            });
        });
        
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('btn-edit-address')) {
                e.preventDefault();
                const addressId = parseInt(e.target.getAttribute('data-address-id'));
                editAddress(addressId);
            }
            
            if (e.target.classList.contains('btn-delete-address')) {
                e.preventDefault();
                const addressId = parseInt(e.target.getAttribute('data-address-id'));
                deleteAddress(addressId);
            }
            
            if (e.target.classList.contains('btn-set-default')) {
                e.preventDefault();
                const addressId = parseInt(e.target.getAttribute('data-address-id'));
                setDefaultAddress(addressId);
            }
        });
        
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('btn-track-order') || e.target.classList.contains('track-order-btn')) {
                e.preventDefault();
                const orderId = e.target.getAttribute('data-order-id') || 
                               e.target.closest('.order-card')?.querySelector('h4')?.textContent?.replace('Order #', '');
                
                if (userData.orders && userData.orders.length > 0) {
                    if (orderId) {
                        showOrderTracking(orderId);
                    } else {
                        showOrderTracking(userData.orders[userData.orders.length - 1].id);
                    }
                } else {
                    alert('No orders found! Please place an order first.');
                }
            }
        });
    }
// Handle avatar upload
document.getElementById('avatar-upload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        // Validate file type
        if (!file.type.match('image.*')) {
            alert('Please select an image file');
            return;
        }
        
        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert('File size must be less than 2MB');
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = function(event) {
            document.getElementById('profile-avatar-img').src = event.target.result;
            
            // Optional: Save to localStorage
            localStorage.setItem('profileAvatar', event.target.result);
        }
        
        reader.readAsDataURL(file);
    }
});

// Optional: Load saved avatar from localStorage
window.addEventListener('load', function() {
    const savedAvatar = localStorage.getItem('profileAvatar');
    if (savedAvatar) {
        document.getElementById('profile-avatar-img').src = savedAvatar;
    }
});

// Optional: Handle drag and drop
const profileAvatar = document.querySelector('.profile-avatar');

profileAvatar.addEventListener('dragover', function(e) {
    e.preventDefault();
    this.classList.add('drag-over');
});

profileAvatar.addEventListener('dragleave', function() {
    this.classList.remove('drag-over');
});

profileAvatar.addEventListener('drop', function(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.match('image.*')) {
        const reader = new FileReader();
        
        reader.onload = function(event) {
            document.getElementById('profile-avatar-img').src = event.target.result;
            localStorage.setItem('profileAvatar', event.target.result);
        }
        
        reader.readAsDataURL(file);
    }
});

// Add this function to handle empty cart buttons
function setupEmptyCartButtons() {
    // Handle "Start Shopping" button in empty cart
    const startShoppingBtn = document.getElementById('start-shopping');
    if (startShoppingBtn) {
        // Remove any existing listeners
        const newBtn = startShoppingBtn.cloneNode(true);
        startShoppingBtn.parentNode.replaceChild(newBtn, startShoppingBtn);
        
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Start Shopping button clicked');
            showPage('products');
        });
    }
    
    // Handle "Browse Products" button in empty wishlist
    const browseProductsBtn = document.getElementById('browse-products');
    if (browseProductsBtn) {
        const newBtn = browseProductsBtn.cloneNode(true);
        browseProductsBtn.parentNode.replaceChild(newBtn, browseProductsBtn);
        
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showPage('products');
        });
    }
    
    // Handle "Continue Shopping" button in confirmation page
    const continueShoppingBtn = document.getElementById('continue-shopping');
    if (continueShoppingBtn) {
        const newBtn = continueShoppingBtn.cloneNode(true);
        continueShoppingBtn.parentNode.replaceChild(newBtn, continueShoppingBtn);
        
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showPage('products');
        });
    }
}

// Call this function whenever cart is rendered
function renderCart() {
    console.log('Rendering cart...');
    const cartItemsContainer = document.querySelector('.cart-items');
    const cartSummary = document.querySelector('.cart-summary');
    
    if (!cartItemsContainer || !cartSummary) {
        console.error('Cart container elements not found');
        return;
    }
    
    cartItemsContainer.innerHTML = '';
    cartSummary.innerHTML = '';
    
    if (!userData.cart || userData.cart.length === 0) {
        console.log('Cart is empty');
        cartItemsContainer.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart"></i>
                <h3>Your Cart is Empty</h3>
                <p>Add some organic goodness to your cart!</p>
                <a href="#" class="btn" id="empty-cart-shop">Start Shopping</a>
            </div>
        `;
        
        cartSummary.innerHTML = `
            <h3>Order Summary</h3>
            <div class="summary-row">
                <span>Subtotal</span>
                <span id="cart-subtotal">₹0</span>
            </div>
            <div class="summary-row">
                <span>Delivery</span>
                <span id="cart-delivery">₹0</span>
            </div>
            <div class="summary-row">
                <span>Tax</span>
                <span id="cart-tax">₹0</span>
            </div>
            <div class="summary-row total">
                <span>Total</span>
                <span id="cart-total">₹0</span>
            </div>
            <button class="btn btn-checkout" id="checkout-btn" disabled>Proceed to Checkout</button>
        `;
        
        // Setup empty cart buttons after rendering
        setTimeout(setupEmptyCartButtons, 50);
        return;
    }
    
    // ... rest of your cart rendering code ...
    
    // Setup empty cart buttons after rendering (in case there are any)
    setTimeout(setupEmptyCartButtons, 50);
}

// Also add this to your setupEventListeners function
function setupEventListeners() {
    console.log('Setting up event listeners...');
    setupLoginEvents();
    setupSignupEvents();
    setupNavigationEvents();
    setupProductEvents();
    setupModalEvents();
    setupLazyLoading();
    setupCouponEvents();
    setupCheckoutEvents();
    setupUPIPaymentEvents();
    setupFeedbackEvents();
    setupEmptyCartButtons(); // Add this line
}

// Add a global click handler as a fallback
document.addEventListener('click', function(e) {
    // Handle any "Start Shopping" buttons
    if (e.target.id === 'start-shopping' || 
        e.target.id === 'empty-cart-shop' || 
        e.target.id === 'browse-products' ||
        e.target.id === 'continue-shopping' ||
        e.target.closest('#start-shopping') ||
        e.target.closest('#empty-cart-shop') ||
        e.target.closest('#browse-products') ||
        e.target.closest('#continue-shopping')) {
        
        e.preventDefault();
        console.log('Shopping button clicked via global handler');
        showPage('products');
    }
});
    // ===== CART FUNCTIONALITY =====
    function setupCartEventListeners() {
        console.log('Setting up cart event listeners...');
        
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('quantity-decrease')) {
                const cartItem = e.target.closest('.cart-item');
                if (cartItem) {
                    const productId = parseInt(cartItem.getAttribute('data-product-id'));
                    console.log('Decreasing quantity for product:', productId);
                    if (!isNaN(productId)) {
                        updateCartQuantity(productId, -1);
                    }
                }
            }
            
            if (e.target.classList.contains('quantity-increase')) {
                const cartItem = e.target.closest('.cart-item');
                if (cartItem) {
                    const productId = parseInt(cartItem.getAttribute('data-product-id'));
                    console.log('Increasing quantity for product:', productId);
                    if (!isNaN(productId)) {
                        updateCartQuantity(productId, 1);
                    }
                }
            }
            
            if (e.target.classList.contains('remove-item') || 
                e.target.closest('.remove-item')) {
                console.log('Remove item button clicked');
                const removeBtn = e.target.classList.contains('remove-item') ? 
                    e.target : e.target.closest('.remove-item');
                const cartItem = removeBtn.closest('.cart-item');
                if (cartItem) {
                    const productId = parseInt(cartItem.getAttribute('data-product-id'));
                    console.log('Removing product from cart:', productId);
                    if (!isNaN(productId)) {
                        removeFromCart(productId);
                    }
                }
            }
            
            if (e.target.classList.contains('move-to-wishlist')) {
                const cartItem = e.target.closest('.cart-item');
                if (cartItem) {
                    const productId = parseInt(cartItem.getAttribute('data-product-id'));
                    moveToWishlist(productId);
                }
            }
            
            if (e.target.classList.contains('save-for-later')) {
                const cartItem = e.target.closest('.cart-item');
                if (cartItem) {
                    const productId = parseInt(cartItem.getAttribute('data-product-id'));
                    saveForLater(productId);
                }
            }
        });
        
        document.addEventListener('click', function(e) {
            if (e.target.id === 'checkout-btn' || e.target.closest('#checkout-btn')) {
                e.preventDefault();
                if (userData.cart.length > 0) {
                    showPage('checkout');
                }
            }
            
            if (e.target.id === 'empty-cart-shop' || e.target.closest('#empty-cart-shop')) {
                e.preventDefault();
                showPage('products');
            }
        });
    }

    // ===== CHECKOUT FUNCTIONALITY =====
   // Add this to your setupCheckoutEvents function
function setupCheckoutEvents() {
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-next')) {
            e.preventDefault();
            const nextStep = e.target.getAttribute('data-next');
            navigateToStep(nextStep);
        }
        
        if (e.target.classList.contains('btn-prev')) {
            e.preventDefault();
            const prevStep = e.target.getAttribute('data-prev');
            navigateToStep(prevStep);
        }
        
        if (e.target.classList.contains('btn-next') && e.target.getAttribute('data-next') === 'confirmation') {
            e.preventDefault();
            
            // Debounce the order processing
            if (e.target.disabled) return;
            e.target.disabled = true;
            
            processOrder();
            
            // Re-enable after a delay
            setTimeout(() => {
                e.target.disabled = false;
            }, 3000);
        }
    });
}
    function initializeCheckout() {
        updateCheckoutSummary();
        setupAddressManagement();
        setupDeliveryOptions();
        setupPaymentMethods();
        setupCheckoutSteps();
        fixCheckoutStepsDisplay();
    }

    function initializeCheckoutSteps() {
        console.log('Initializing checkout steps...');
        
        let activeStep = 'delivery';
        const visibleStep = document.querySelector('.checkout-step.active');
        if (visibleStep) {
            activeStep = visibleStep.id.replace('-step', '');
        }
        
        updateStepIndicators(activeStep);
        setupStepNavigation();
    }

    function updateStepIndicators(activeStep) {
        console.log('Updating step indicators for:', activeStep);
        
        const steps = document.querySelectorAll('.checkout-steps .step');
        if (!steps || steps.length === 0) {
            console.log('No step indicators found');
            return;
        }
        
        // Add step numbers if they're empty
        steps.forEach((step, index) => {
            const stepNumber = step.querySelector('.step-number');
            if (stepNumber && !stepNumber.textContent.trim()) {
                stepNumber.textContent = index + 1;
            }
        });
        
        const stepIndexMap = {
            'delivery': 0,
            'payment': 1,
            'confirmation': 2
        };
        
        const activeIndex = stepIndexMap[activeStep] !== undefined ? stepIndexMap[activeStep] : 0;
        
        steps.forEach((step, index) => {
            step.classList.remove('active');
            step.classList.remove('completed');
            
            if (index === activeIndex) {
                step.classList.add('active');
            } else if (index < activeIndex) {
                step.classList.add('completed');
            }
            
            const stepNumber = step.querySelector('.step-number');
            if (stepNumber) {
                if (index === activeIndex) {
                    stepNumber.style.backgroundColor = '#4CAF50';
                    stepNumber.style.color = 'white';
                    stepNumber.style.transform = 'scale(1.1)';
                } else if (index < activeIndex) {
                    stepNumber.style.backgroundColor = '#4CAF50';
                    stepNumber.style.color = 'white';
                    stepNumber.style.transform = 'scale(1)';
                } else {
                    stepNumber.style.backgroundColor = '#e0e0e0';
                    stepNumber.style.color = '#666';
                    stepNumber.style.transform = 'scale(1)';
                }
            }
            
            const stepLabel = step.querySelector('.step-label');
            if (stepLabel) {
                if (index === activeIndex) {
                    stepLabel.style.color = '#4CAF50';
                    stepLabel.style.fontWeight = 'bold';
                } else if (index < activeIndex) {
                    stepLabel.style.color = '#4CAF50';
                    stepLabel.style.fontWeight = 'normal';
                } else {
                    stepLabel.style.color = '#666';
                    stepLabel.style.fontWeight = 'normal';
                }
            }
        });
        
        updateCheckoutProgressLine(activeIndex, steps.length);
    }

    function updateCheckoutProgressLine(activeIndex, totalSteps) {
        const checkoutSteps = document.querySelector('.checkout-steps');
        if (!checkoutSteps) return;
        
        const existingLine = checkoutSteps.querySelector('.progress-line');
        if (existingLine) existingLine.remove();
        
        const progressLine = document.createElement('div');
        progressLine.className = 'progress-line';
        progressLine.style.cssText = `
            
        `;
        
        const progressPercentage = activeIndex / (totalSteps - 1) * 100;
        
        const filledLine = document.createElement('div');
        filledLine.className = 'progress-filled';
        filledLine.style.cssText = `
          
        `;
        
        progressLine.appendChild(filledLine);
        checkoutSteps.style.position = 'relative';
        checkoutSteps.appendChild(progressLine);
    }

    function setupStepNavigation() {
        const nextButtons = document.querySelectorAll('.btn-next');
        const prevButtons = document.querySelectorAll('.btn-prev');
        
        nextButtons.forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            newButton.addEventListener('click', function(e) {
                e.preventDefault();
                const nextStep = this.getAttribute('data-next');
                if (nextStep) {
                    navigateToStep(nextStep);
                }
            });
        });

        prevButtons.forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            newButton.addEventListener('click', function(e) {
                e.preventDefault();
                const prevStep = this.getAttribute('data-prev');
                if (prevStep) {
                    navigateToStep(prevStep);
                }
            });
        });
    }

    function fixCheckoutStepsDisplay() {
        const checkoutSteps = document.querySelector('.checkout-steps');
        if (checkoutSteps) {
            checkoutSteps.style.display = 'flex';
            checkoutSteps.style.visibility = 'visible';
            checkoutSteps.style.opacity = '1';
            
            const steps = checkoutSteps.querySelectorAll('.step');
            steps.forEach(step => {
                step.style.display = 'flex';
                step.style.alignItems = 'center';
                step.style.gap = '8px';
                step.style.position = 'relative';
                step.style.zIndex = '2';
            });
        }
    }
    
    function setupCheckoutSteps() {
        console.log('Checkout steps setup complete');
        
        const trackOrderBtn = document.getElementById('track-order');
        if (trackOrderBtn) {
            trackOrderBtn.addEventListener('click', function() {
                if (userData.orders && userData.orders.length > 0) {
                    showOrderTracking(userData.orders[userData.orders.length - 1].id);
                } else {
                    alert('No orders found! Please place an order first.');
                }
            });
        }
    }

    // ===== ADDRESS MANAGEMENT =====
    function setupAddressManagement() {
        const addressForm = document.getElementById('address-form');
        
        if (!addressForm) return;
        
        const formInputs = addressForm.querySelectorAll('input, textarea');
        
        addressForm.style.display = 'none';
        
        const savedAddressesSection = document.querySelector('.saved-addresses-section');
        if (savedAddressesSection && (!userData.addresses || userData.addresses.length === 0)) {
            savedAddressesSection.style.display = 'none';
        } else if (savedAddressesSection) {
            const firstAddressRadio = savedAddressesSection.querySelector('input[type="radio"]');
            if (firstAddressRadio) {
                firstAddressRadio.checked = true;
                const addressId = parseInt(firstAddressRadio.value);
                const address = userData.addresses.find(addr => addr.id === addressId);
                if (address) {
                    fillFormWithAddress(address);
                }
            }
        }
        
        const savedAddressRadios = document.querySelectorAll('input[name="saved-address"]');
        if (savedAddressRadios.length > 0) {
            savedAddressRadios.forEach(radio => {
                radio.addEventListener('change', function() {
                    if (this.value === 'new') {
                        addressForm.style.display = 'block';
                        clearForm(formInputs);
                        const saveAddressCheckbox = document.getElementById('save-address');
                        if (saveAddressCheckbox) saveAddressCheckbox.checked = true;
                    } else {
                        addressForm.style.display = 'none';
                        const addressId = parseInt(this.value);
                        const address = userData.addresses.find(addr => addr.id === addressId);
                        if (address) {
                            fillFormWithAddress(address);
                        }
                    }
                });
            });
        }
        
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('btn-edit-address-checkout')) {
                e.preventDefault();
                const addressId = parseInt(e.target.getAttribute('data-address-id'));
                
                const newAddressRadio = document.getElementById('address-new');
                if (newAddressRadio) {
                    newAddressRadio.checked = true;
                    addressForm.style.display = 'block';
                    
                    const address = userData.addresses.find(addr => addr.id === addressId);
                    if (address) {
                        fillFormWithAddress(address);
                    }
                }
            }
        });
        
        renderCheckoutAddresses();
    }

    function fillFormWithAddress(address) {
        const elements = {
            'delivery-name': address.fullName || address.name || '',
            'delivery-phone': address.phone || '',
            'delivery-address': address.street || '',
            'delivery-city': address.city || '',
            'delivery-pincode': address.pincode || '',
            'delivery-state': address.state || ''
        };
        
        Object.keys(elements).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.value = elements[id];
            }
        });
    }

    function clearForm(formInputs) {
        formInputs.forEach(input => {
            if (input.type !== 'checkbox') {
                input.value = '';
            }
        });
    }

    function renderCheckoutAddresses() {
        const savedAddressesList = document.getElementById('saved-addresses-list');
        if (!savedAddressesList || !userData.addresses || userData.addresses.length === 0) return;
        
        savedAddressesList.innerHTML = '';
        
        userData.addresses.forEach(address => {
            const addressItem = document.createElement('div');
            addressItem.className = 'address-option';
            addressItem.innerHTML = `
                <input type="radio" name="saved-address" id="address-${address.id}" value="${address.id}" ${address.default ? 'checked' : ''}>
                <label for="address-${address.id}">
                    <div class="address-option-content">
                        <div class="address-option-header">
                            <strong>${address.name}</strong>
                            ${address.default ? '<span class="default-badge">Default</span>' : ''}
                        </div>
                        <div class="address-option-details">
                            <p>${address.fullName || address.name}</p>
                            <p>${address.street}</p>
                            <p>${address.city}, ${address.state} - ${address.pincode}</p>
                            <p>Phone: ${address.phone}</p>
                        </div>
                    </div>
                </label>
            `;
            savedAddressesList.appendChild(addressItem);
        });
          document.querySelectorAll('.btn-edit-address-checkout').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const addressId = parseInt(this.getAttribute('data-address-id'));
                
                const newAddressRadio = document.getElementById('address-new');
                if (newAddressRadio) {
                    newAddressRadio.checked = true;
                    newAddressRadio.dispatchEvent(new Event('change'));
                    
                    const address = userData.addresses.find(addr => addr.id === addressId);
                    if (address) {
                        fillFormWithAddress(address);
                    }
                }
            });
        });    
        document.querySelectorAll('input[name="saved-address"]').forEach(radio => {
            radio.addEventListener('change', function() {
                const addressForm = document.getElementById('address-form');
                if (this.value !== 'new') {
                    if (addressForm) {
                        addressForm.style.display = 'none';
                    }
                } else {
                    if (addressForm) {
                        addressForm.style.display = 'block';
                    }
                }
            });
        });
    }

    // ===== DELIVERY OPTIONS =====
    function setupDeliveryOptions() {
        const deliveryOptions = document.querySelectorAll('.delivery-option input');
        deliveryOptions.forEach(option => {
            option.addEventListener('change', function() {
                updateDeliveryOption(this.value);
            });
        });
    }

    function updateDeliveryOption(option) {
        const deliveryOptions = document.querySelectorAll('.delivery-option');
        deliveryOptions.forEach(opt => opt.classList.remove('active'));
        
        const selectedOption = document.querySelector(`.delivery-option input[value="${option}"]`)?.closest('.delivery-option');
        if (selectedOption) {
            selectedOption.classList.add('active');
        }
        
        updateCheckoutSummary();
    }

    // ===== PAYMENT METHODS =====
    function setupPaymentMethods() {
        console.log('Setting up payment listeners...');
        
        // First, ensure all payment forms are hidden initially
        document.querySelectorAll('.payment-form').forEach(form => {
            form.classList.remove('active');
        });
        
        // Show the default selected payment form (usually card)
        const defaultPayment = document.querySelector('input[name="payment"]:checked');
        if (defaultPayment) {
            const defaultForm = document.getElementById(`${defaultPayment.value}-form`);
            if (defaultForm) {
                defaultForm.classList.add('active');
            }
        }
        
        // Add change event listeners to payment radio buttons
        document.querySelectorAll('input[name="payment"]').forEach(radio => {
            // Remove existing listeners by cloning and replacing
            const newRadio = radio.cloneNode(true);
            radio.parentNode.replaceChild(newRadio, radio);
            
            newRadio.addEventListener('change', function() {
                console.log('Payment method changed to:', this.value);
                
                // Update active class on payment options
                document.querySelectorAll('.payment-option').forEach(option => {
                    option.classList.remove('active');
                });
                this.closest('.payment-option').classList.add('active');
                
                // Hide all payment forms
                document.querySelectorAll('.payment-form').forEach(form => {
                    form.classList.remove('active');
                });
                
                // Show the selected payment form
                const selectedForm = document.getElementById(`${this.value}-form`);
                if (selectedForm) {
                    selectedForm.classList.add('active');
                    console.log(`Showing ${this.value} form`);
                } else {
                    console.error(`Payment form for ${this.value} not found`);
                }
                
                // Special handling for UPI
                if (this.value === 'upi') {
                    setTimeout(() => {
                        if (!isQRGenerated) {
                            initializeUPIPayment();
                        }
                    }, 100);
                }
            });
        });

        // Add click event listeners to payment buttons
        document.addEventListener('click', function(e) {
            if (e.target.id === 'card-pay-btn' || e.target.closest('#card-pay-btn')) {
                e.preventDefault();
                const cardForm = document.getElementById('card-form');
                if (validateCardForm(cardForm)) {
                    processPayment('card');
                }
            }
            
            if (e.target.id === 'upi-pay-btn' || e.target.closest('#upi-pay-btn')) {
                e.preventDefault();
                
                if (upiPaymentInProgress) {
                    console.log('UPI payment already in progress');
                    return;
                }
                
                upiPaymentInProgress = true;
                processPayment('upi');
            }
            
            if (e.target.id === 'cod-confirm-btn' || e.target.closest('#cod-confirm-btn')) {
                e.preventDefault();
                processPayment('cod');
            }
        });
    }

    // ===== UPI QR CODE PAYMENT SYSTEM =====
    function setupUPIPaymentEvents() {
        document.addEventListener('DOMContentLoaded', function() {
            if (document.getElementById('upi-payment') && document.getElementById('upi-payment').checked) {
                initializeUPIPayment();
            }
        });

        const upiPaymentRadio = document.getElementById('upi-payment');
        if (upiPaymentRadio) {
            upiPaymentRadio.addEventListener('change', function() {
                if (this.checked && !isQRGenerated) {
                    initializeUPIPayment();
                }
            });
        }
    }

    function initializeUPIPayment() {
        updateOrderAmounts();
        
        // Ensure order ID exists before generating QR
        ensureOrderId();
        
        generateQRCode();
        startTimer();
        updateGenerationTime();
        
        isQRGenerated = true;
        qrExpired = false;
        
        const qrOverlay = document.getElementById('qr-overlay');
        if (qrOverlay) {
            qrOverlay.style.display = 'none';
        }
        
        const qrCodeElement = document.querySelector('.qr-code');
        if (qrCodeElement) {
            qrCodeElement.style.opacity = '1';
            qrCodeElement.style.pointerEvents = 'auto';
        }
    }

    function updateOrderAmounts() {
        const totals = calculateCartTotals();
        
        const elements = {
            'subtotal': totals.subtotal.toFixed(2),
            'tax': totals.tax.toFixed(2),
            'shipping': totals.delivery.toFixed(2),
            'total-amount': totals.total.toFixed(2),
            'display-amount': totals.total.toFixed(2)
        };
        
        Object.keys(elements).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = id === 'display-amount' ? elements[id] : `₹${elements[id]}`;
            }
        });
        
        return totals.total;
    }

    function generateQRCode() {
        const amount = updateOrderAmounts();
        const merchantUPI = 'organicmart@upi';
        // ensure a consistent id is available
        ensureOrderId();
        console.log('generateQRCode - currentOrderId =', currentOrderId);
        // update all order-id displays
        displayOrderId(currentOrderId);
        // include order id in transaction note of upi link
        const upiLink = `upi://pay?pa=${merchantUPI}&pn=OrganicMart&am=${amount}&cu=INR&tn=Order%20${currentOrderId}`;
        
        const qrContainer = document.getElementById('qr-code');
        if (!qrContainer) return;
        
        qrContainer.innerHTML = '';
        
        const transactionId = 'TXN' + Math.floor(Math.random() * 1000000000).toString().padStart(10, '0');
        const txnIdElement = document.getElementById('txn-id');
        if (txnIdElement) {
            txnIdElement.textContent = transactionId;
        }
        
        try {
            // Check if QRCode library is available
            if (typeof QRCode !== 'undefined') {
                const qrCode = new QRCode(qrContainer, {
                    text: upiLink,
                    width: 250,
                    height: 250,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            } else {
                // Fallback to simple QR code representation
                qrContainer.innerHTML = `
                    <div class="qr-error">
                        <img src="./qr.jpeg" alt="QR Code" id="contact-qr">
                    </div>
                `;
            }
        } catch (error) {
            console.error('QR Code generation error:', error);
            qrContainer.innerHTML = `
                <div class="qr-error">
                    <div style="background: #f8d7da; width: 250px; height: 250px; display: flex; align-items: center; justify-content: center; border: 2px dashed #f44336; border-radius: 10px;">
                        <div style="text-align: center;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 50px; color: #f44336; margin-bottom: 10px;"></i>
                            <p style="margin: 0; font-size: 14px; color: #721c24;">UPI ID: ${merchantUPI}</p>
                            <p style="margin: 5px 0 0; font-size: 12px; color: #721c24;">Amount: ₹${amount}</p>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    function startTimer() {
        clearInterval(qrTimer);
        timeLeft = 300;
        
        qrTimer = setInterval(function() {
            timeLeft--;
            
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            
            const timerMinutes = document.getElementById('timer-minutes');
            const timerSeconds = document.getElementById('timer-seconds');
            const progressBar = document.getElementById('progress-bar');
            const timerCountdown = document.querySelector('.timer-countdown');
            
            if (timerMinutes) timerMinutes.textContent = minutes.toString().padStart(2, '0');
            if (timerSeconds) timerSeconds.textContent = seconds.toString().padStart(2, '0');
            
            if (progressBar) {
                const progress = ((300 - timeLeft) / 300) * 100;
                progressBar.style.width = `${progress}%`;
                
                if (timeLeft < 60) {
                    progressBar.style.backgroundColor = '#f44336';
                    if (timerCountdown) timerCountdown.style.color = '#f44336';
                } else if (timeLeft < 120) {
                    progressBar.style.backgroundColor = '#ff9800';
                    if (timerCountdown) timerCountdown.style.color = '#ff9800';
                } else {
                    progressBar.style.backgroundColor = '#4CAF50';
                    if (timerCountdown) timerCountdown.style.color = '#333';
                }
            }
            
            if (timeLeft <= 0) {
                clearInterval(qrTimer);
                qrExpired = true;
                showQRExpired();
            }
        }, 1000);
    }

    function showQRExpired() {
        const overlay = document.getElementById('qr-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.style.opacity = '1';
        }
        
        const qrCodeElement = document.querySelector('.qr-code');
        if (qrCodeElement) {
            qrCodeElement.style.opacity = '0.3';
            qrCodeElement.style.pointerEvents = 'none';
        }
    }

    function generateNewQR() {
        timeLeft = 300;
        const timerMinutes = document.getElementById('timer-minutes');
        const timerSeconds = document.getElementById('timer-seconds');
        const progressBar = document.getElementById('progress-bar');
        const timerCountdown = document.querySelector('.timer-countdown');
        
        if (timerMinutes) timerMinutes.textContent = '05';
        if (timerSeconds) timerSeconds.textContent = '00';
        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.style.backgroundColor = '#4CAF50';
        }
        if (timerCountdown) timerCountdown.style.color = '#333';
        
        const overlay = document.getElementById('qr-overlay');
        if (overlay) overlay.style.display = 'none';
        
        const qrCodeElement = document.querySelector('.qr-code');
        if (qrCodeElement) {
            qrCodeElement.style.opacity = '1';
            qrCodeElement.style.pointerEvents = 'auto';
        }
        
        const transactionId = 'TXN' + Math.floor(Math.random() * 1000000000).toString().padStart(10, '0');
        const txnIdElement = document.getElementById('txn-id');
        if (txnIdElement) {
            txnIdElement.textContent = transactionId;
        }
        
        updateGenerationTime();
        generateQRCode();
        startTimer();
        
        qrExpired = false;
    }

    function updateGenerationTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const qrTimeElement = document.getElementById('qr-time');
        if (qrTimeElement) qrTimeElement.textContent = timeString;
    }

    function copyUPI() {
        const upiId = 'organicmart@upi';
        navigator.clipboard.writeText(upiId).then(() => {
            const copyBtn = event.target.closest('.copy-btn-small') || event.target;
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i>';
            copyBtn.style.backgroundColor = '#4CAF50';
            
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.style.backgroundColor = '';
            }, 2000);
            
            showToastMessage('UPI ID copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy UPI ID:', err);
            showToastMessage('Failed to copy UPI ID');
        });
    }

    function downloadQR() {
        if (qrExpired) {
            alert('Please generate a new QR code first');
            return;
        }
        
        const canvas = document.querySelector('#qr-code canvas');
        if (canvas) {
            const link = document.createElement('a');
            link.download = `OrganicMart-Payment-QR-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToastMessage('QR code downloaded!');
        } else {
            showToastMessage('QR code not available');
        }
    }

    function shareQR() {
        if (qrExpired) {
            alert('QR code has expired. Please generate a new one.');
            return;
        }
        
        const amountElement = document.getElementById('display-amount');
        const amount = amountElement ? amountElement.textContent : '0';
        
        if (navigator.share) {
            navigator.share({
                title: 'OrganicMart Payment QR Code',
                text: `Scan to pay ₹${amount} to OrganicMart`,
                url: window.location.href
            });
        } else {
            downloadQR();
        }
    }

    function checkPaymentStatus() {
        showToastMessage('Checking payment status...');
        
        const overlay = document.createElement('div');
        overlay.className = 'status-overlay';
        overlay.innerHTML = `
            <div class="status-modal">
                <div class="status-loader">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <h4>Verifying Payment</h4>
                <p>Please wait while we verify your payment...</p>
            </div>
        `;
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            document.body.removeChild(overlay);
            showToastMessage('Payment verification complete!');
        }, 2000);
    }

    function validateCardForm(form) {
        const cardNumber = form.querySelector('#card-number').value;
        const cardExpiry = form.querySelector('#card-expiry').value;
        const cardCvv = form.querySelector('#card-cvv').value;
        const cardName = form.querySelector('#card-name').value;
        
        if (!cardNumber || cardNumber.replace(/\s/g, '').length !== 16) {
            alert('Please enter a valid 16-digit card number');
            return false;
        }
        
        if (!cardExpiry || !/^\d{2}\/\d{2}$/.test(cardExpiry)) {
            alert('Please enter a valid expiry date (MM/YY)');
            return false;
        }
        
        if (!cardCvv || cardCvv.length !== 3) {
            alert('Please enter a valid 3-digit CVV');
            return false;
        }
        
        if (!cardName) {
            alert('Please enter the name on card');
            return false;
        }
        
        return true;
    }

    function processPayment(paymentType) {
        console.log("Processing payment:", paymentType);
        
        const modal = document.getElementById('payment-modal');
        if (!modal) {
            console.error('Payment modal not found');
            // If modal doesn't exist, proceed directly to order completion
            if (paymentType === 'cod') {
                completeOrder();
            }
            return;
        }
        
        const loader = modal.querySelector('.payment-loader');
        const success = modal.querySelector('.payment-success');
        const failed = modal.querySelector('.payment-failed');
        
        if (loader) loader.style.display = 'block';
        if (success) success.style.display = 'none';
        if (failed) failed.style.display = 'none';
        modal.style.display = 'flex';
        
        const statusTitle = document.getElementById('payment-status-title');
        const statusMessage = document.getElementById('payment-status-message');
        const successMessage = document.getElementById('payment-success-message');
        const paymentMethod = document.getElementById('payment-method');
        const paymentAmount = document.getElementById('payment-amount');
        
        const totalAmountElement = document.getElementById('checkout-total');
        const totalAmount = totalAmountElement ? totalAmountElement.textContent : '0';
        if (paymentAmount) {
            paymentAmount.textContent = totalAmount;
        }
        
        const paymentMessages = {
            'card': {
                status: 'Processing Card Payment',
                message: 'Verifying your card details...',
                success: 'Card payment processed successfully!',
                method: 'Credit/Debit Card'
            },
            'upi': {
                status: 'Processing UPI Payment',
                message: 'Please complete the payment using the QR code...',
                success: 'UPI payment completed successfully!',
                method: 'UPI - QR Code'
            },
            'cod': {
                status: 'Confirming COD Order',
                message: 'Processing your COD request...',
                success: 'COD order confirmed successfully!',
                method: 'Cash on Delivery'
            }
        };
        
        const messages = paymentMessages[paymentType] || paymentMessages.upi;
        
        if (statusTitle) statusTitle.textContent = messages.status;
        if (statusMessage) statusMessage.textContent = messages.message;
        if (successMessage) successMessage.textContent = messages.success;
        if (paymentMethod) paymentMethod.textContent = messages.method;
        
        const transactionId = 'TXN' + Math.floor(Math.random() * 1000000000).toString().padStart(10, '0');
        const transactionIdElement = document.getElementById('transaction-id');
        if (transactionIdElement) {
            transactionIdElement.textContent = transactionId;
        }
        
        setTimeout(() => {
            // For demo purposes, always succeed (90% success rate)
            const isSuccess = Math.random() > 0.1;
            
            if (isSuccess) {
                if (loader) loader.style.display = 'none';
                if (success) success.style.display = 'block';
                
                if (paymentType === 'upi') {
                    upiPaymentInProgress = false;
                }
                
                setTimeout(() => {
                    closePaymentModal();
                    completeOrder();
                }, 2000);
            } else {
                if (loader) loader.style.display = 'none';
                if (failed) failed.style.display = 'block';
                
                if (paymentType === 'upi') {
                    upiPaymentInProgress = false;
                }
                    
                const errorMessages = {
                    'card': 'Payment was declined by your bank.',
                    'upi': 'UPI transaction failed. Please try again.',
                    'cod': 'COD not available for this address.'
                };
                
                const errorMessageElement = document.getElementById('payment-error-message');
                if (errorMessageElement) {
                    errorMessageElement.textContent = errorMessages[paymentType] || 'Payment failed. Please try again.';
                }
                
                const retryPaymentBtn = document.getElementById('retry-payment');
                if (retryPaymentBtn) {
                    retryPaymentBtn.onclick = function() {
                        closePaymentModal();
                    };
                }
            }
        }, 3000);
    }

    function closePaymentModal() {
        const modal = document.getElementById('payment-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // ===== ORDER DETAILS AND TRACKING WITHIN ORDERS SECTION =====
// Make these functions globally accessible
window.showOrderDetails = function(orderId) {
    console.log('showOrderDetails called with orderId:', orderId);
    
    const userData = window.userData;
    
    if (!userData || !userData.orders || userData.orders.length === 0) {
        alert('No orders found!');
        return;
    }
    
    const order = userData.orders.find(o => o.id == orderId);
    if (!order) {
        alert('Order not found!');
        return;
    }
    
    // Hide orders list and show order details
    const ordersList = document.querySelector('.orders-list');
    const orderDetailsContainer = document.getElementById('order-details-container');
    
    if (ordersList) {
        ordersList.style.display = 'none';
    }
    
    if (!orderDetailsContainer) {
        // Create order details container if it doesn't exist
        const container = document.createElement('div');
        container.id = 'order-details-container';
        container.className = 'order-details-container';
        
        const ordersTab = document.getElementById('orders');
        if (ordersTab) {
            ordersTab.appendChild(container);
        }
    }
    
    const container = document.getElementById('order-details-container');
    if (container) {
        container.style.display = 'block';
        container.innerHTML = generateOrderDetailsHTML(order);
    }
}

window.showOrderTracking = function(orderId) {
    console.log('showOrderTracking called with orderId:', orderId);
    
    const userData = window.userData;
    
    if (!userData || !userData.orders || userData.orders.length === 0) {
        alert('No orders found!');
        return;
    }
    
    const order = userData.orders.find(o => o.id == orderId);
    if (!order) {
        alert('Order not found!');
        return;
    }
    
    // Hide orders list and show tracking details
    const ordersList = document.querySelector('.orders-list');
    const orderDetailsContainer = document.getElementById('order-details-container');
    
    if (ordersList) {
        ordersList.style.display = 'none';
    }
    
    if (!orderDetailsContainer) {
        // Create order details container if it doesn't exist
        const container = document.createElement('div');
        container.id = 'order-details-container';
        container.className = 'order-details-container';
        
        const ordersTab = document.getElementById('orders');
        if (ordersTab) {
            ordersTab.appendChild(container);
        }
    }
    
    const container = document.getElementById('order-details-container');
    if (container) {
        container.style.display = 'block';
        container.innerHTML = generateOrderTrackingHTML(order);
    }
}

window.backToOrders = function() {
    console.log('backToOrders called');
    
    const ordersList = document.querySelector('.orders-list');
    const orderDetailsContainer = document.getElementById('order-details-container');
    
    if (ordersList) {
        ordersList.style.display = 'block';
    }
    
    if (orderDetailsContainer) {
        orderDetailsContainer.style.display = 'none';
        orderDetailsContainer.innerHTML = '';
    }
}

function generateOrderDetailsHTML(order) {
    // Fix image URLs
    const itemsHTML = order.items.map(item => {
        const imageUrl = item.image && item.image.startsWith('http') 
            ? item.image 
            : (item.image ? window.location.origin + '/' + item.image : 'https://via.placeholder.com/60x60/4CAF50/ffffff?text=🍎');
        
        return `
            <div class="order-item-full">
                <img src="${imageUrl}" 
                     alt="${item.name}"
                     onerror="this.src='https://via.placeholder.com/60x60/4CAF50/ffffff?text=🍎'">
                <div class="item-details">
                    <div class="item-name">${item.name}</div>
                    <div class="item-meta">${item.weight || '500g'} × ${item.quantity}</div>
                </div>
                <div class="item-price">₹${(item.price * item.quantity).toFixed(2)}</div>
            </div>
        `;
    }).join('');
    
    return `
        <div class="order-details-header">
            <h3>Order #${order.id}</h3>
            <button class="btn-back-to-orders" onclick="backToOrders()">
                <i class="fas fa-arrow-left"></i> Back to Orders
            </button>
        </div>
        
        <div class="order-details-tabs">
            <button class="tab-btn active" onclick="showOrderDetails('${order.id}')">Order Details</button>
            <button class="tab-btn" onclick="showOrderTracking('${order.id}')">Track Order</button>
        </div>
        
        <div class="order-details-content">
            <div class="details-section">
                <h4>Order Status</h4>
                <div class="status-badge" style="background: ${order.status === 'delivered' ? '#e8f5e9' : '#fff3e0'}; color: ${order.status === 'delivered' ? '#2e7d32' : '#f57c00'};">
                    ${order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Confirmed'}
                </div>
            </div>
            
            <div class="details-section">
                <h4>Order Items</h4>
                <div class="order-items-full">
                    ${itemsHTML}
                </div>
            </div>
            
            <div class="details-section">
                <h4>Delivery Address</h4>
                <div class="address-card">
                    <p><strong>${order.address?.name || 'Customer'}</strong></p>
                    <p>${order.address?.address || order.address?.street || ''}</p>
                    <p>${order.address?.city || ''}, ${order.address?.state || ''} - ${order.address?.pincode || ''}</p>
                    <p>Phone: ${order.address?.phone || ''}</p>
                </div>
            </div>
            
            <div class="details-section">
                <h4>Payment Summary</h4>
                <div class="payment-summary">
                    <div class="summary-row">
                        <span>Payment Method:</span>
                        <span>${order.payment || 'Not specified'}</span>
                    </div>
                    <div class="summary-row">
                        <span>Subtotal:</span>
                        <span>₹${(order.subtotal || 0).toFixed(2)}</span>
                    </div>
                    <div class="summary-row">
                        <span>Delivery:</span>
                        <span>₹${(order.delivery || 0).toFixed(2)}</span>
                    </div>
                    <div class="summary-row">
                        <span>Tax:</span>
                        <span>₹${(order.tax || 0).toFixed(2)}</span>
                    </div>
                    ${order.couponDiscount > 0 ? `
                    <div class="summary-row discount">
                        <span>Discount:</span>
                        <span>-₹${order.couponDiscount.toFixed(2)}</span>
                    </div>
                    ` : ''}
                    <div class="summary-row total">
                        <span>Total:</span>
                        <span>₹${(order.total || 0).toFixed(2)}</span>
                    </div>
                </div>
            </div>
            
            <div class="details-section">
                <h4>Order Date</h4>
                <p>${order.date || ''} ${order.time || ''}</p>
            </div>
        </div>
    `;
}

function generateOrderTrackingHTML(order) {
    const deliveryDetails = generateDeliveryDetails(order);
    
    // Fix image URLs for items in tracking view
    const itemsHTML = order.items.map(item => {
        const imageUrl = item.image && item.image.startsWith('http') 
            ? item.image 
            : (item.image ? window.location.origin + '/' + item.image : 'https://via.placeholder.com/40x40/4CAF50/ffffff?text=🍎');
        
        return `
            <div class="summary-item">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${imageUrl}" 
                         alt="${item.name}" 
                         style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;"
                         onerror="this.src='https://via.placeholder.com/40x40/4CAF50/ffffff?text=🍎'">
                    <span>${item.name} × ${item.quantity}</span>
                </div>
                <span>₹${(item.price * item.quantity).toFixed(2)}</span>
            </div>
        `;
    }).join('');
    
    return `
        <div class="order-details-header">
            <h3>Track Order #${order.id}</h3>
            <button class="btn-back-to-orders" onclick="backToOrders()">
                <i class="fas fa-arrow-left"></i> Back to Orders
            </button>
        </div>
        
        <div class="order-details-tabs">
            <button class="tab-btn" onclick="showOrderDetails('${order.id}')">Order Details</button>
            <button class="tab-btn active" onclick="showOrderTracking('${order.id}')">Track Order</button>
        </div>
        
        <div class="order-details-content">
            <div class="details-section">
                <h4>Delivery Information</h4>
                <div class="delivery-info-grid">
                    <div class="info-item">
                        <span class="info-label">Tracking Number</span>
                        <span class="info-value">${deliveryDetails.trackingNumber}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Expected Delivery</span>
                        <span class="info-value">${deliveryDetails.deliveryDate}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Time Window</span>
                        <span class="info-value">${deliveryDetails.timeWindow}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Delivery Agent</span>
                        <span class="info-value">${deliveryDetails.agentName}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Contact</span>
                        <span class="info-value">${deliveryDetails.agentContact}</span>
                    </div>
                </div>
            </div>
            </div>
            
            <div class="details-section">
                <h4>Order Items</h4>
                <div class="order-items-summary">
                    ${itemsHTML}
                </div>
                <div class="total-row">
                    <span>Total Amount</span>
                    <span>₹${(order.total || 0).toFixed(2)}</span>
                </div>
            </div>
            
            <div class="details-section">
                <h4>Delivery Address</h4>
                <p>${order.address?.address || order.address?.street || ''}, ${order.address?.city || ''}, ${order.address?.state || ''} - ${order.address?.pincode || ''}</p>
                <p><strong>Phone:</strong> ${order.address?.phone || ''}</p>
            </div>
        </div>
    `;
}

function generateDeliveryDetails(order) {
    // Get current date and add days based on order status
    const today = new Date();
    let deliveryDate = new Date(today);
    let currentStep = 3; // Default to confirmed (step 3)
    let statuses = [];
    
    if (order.status === 'delivered') {
        deliveryDate.setDate(today.getDate() - 2); // Delivered 2 days ago
        currentStep = 4; // All steps completed (4 steps)
        statuses = [
            { 
                number: 1,
                status: 'Delivered', 
                description: 'Your order has been delivered successfully', 
                time: '10:30 AM',
                subStatus: 'Package delivered to recipient',
                icon: 'fa-check-circle'
            },
            { 
                number: 2,
                status: 'Out for Delivery', 
                description: 'Your order is out for delivery', 
                time: '9:15 AM',
                subStatus: 'Delivery agent on the way',
                icon: 'fa-truck'
            },
            { 
                number: 3,
                status: 'Order Processed', 
                description: 'Your order has been processed', 
                time: '8:30 AM',
                subStatus: 'Payment verified and order confirmed',
                icon: 'fa-credit-card'
            },
            { 
                number: 4,
                status: 'Order Confirmed', 
                description: 'Your order has been confirmed', 
                time: 'Yesterday, 6:30 PM',
                subStatus: 'Order placed successfully',
                icon: 'fa-check-circle'
            }
        ];
    } else if (order.status === 'out_for_delivery') {
        deliveryDate.setDate(today.getDate()); // Today
        currentStep = 2; // Out for delivery (step 2)
        statuses = [
            { 
                number: 1,
                status: 'Out for Delivery', 
                description: 'Your order is out for delivery', 
                time: '9:15 AM',
                subStatus: 'Delivery agent is on the way',
                icon: 'fa-truck'
            },
            { 
                number: 2,
                status: 'Order Processed', 
                description: 'Your order has been processed', 
                time: '8:30 AM',
                subStatus: 'Payment verified and order confirmed',
                icon: 'fa-credit-card'
            },
            { 
                number: 3,
                status: 'Order Confirmed', 
                description: 'Your order has been confirmed', 
                time: 'Yesterday, 6:30 PM',
                subStatus: 'Order placed successfully',
                icon: 'fa-check-circle'
            }
        ];
    } else if (order.status === 'processing') {
        deliveryDate.setDate(today.getDate() + 1); // Tomorrow
        currentStep = 2; // Processing (step 2)
        statuses = [
            { 
                number: 1,
                status: 'Processing', 
                description: 'Your order is being processed', 
                time: '10:30 AM',
                subStatus: 'Preparing your items',
                icon: 'fa-spinner'
            },
            { 
                number: 2,
                status: 'Order Confirmed', 
                description: 'Your order has been confirmed', 
                time: '9:15 AM',
                subStatus: 'Payment verified',
                icon: 'fa-check-circle'
            }
        ];
    } else {
        deliveryDate.setDate(today.getDate() + 3); // Will deliver in 3 days
        currentStep = 1; // Confirmed (step 1)
        statuses = [
            { 
                number: 1,
                status: 'Order Confirmed', 
                description: 'Your order has been confirmed', 
                time: '10:30 AM',
                subStatus: 'Order placed successfully',
                icon: 'fa-check-circle'
            }
        ];
    }
    
    const formattedDate = deliveryDate.toLocaleDateString('en-IN', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'short' 
    });
    
    // Generate time window based on order ID or random
    const timeWindows = [
        '9:00 AM - 12:00 PM',
        '12:00 PM - 3:00 PM',
        '3:00 PM - 6:00 PM',
        '6:00 PM - 9:00 PM'
    ];
    const timeWindow = timeWindows[parseInt(order.id.slice(-1)) % 4] || timeWindows[0];
    
    // Generate agent name based on order ID
    const agents = ['Rajesh Kumar', 'Amit Sharma', 'Priya Patel', 'Suresh Nair', 'Meena Singh'];
    const agentName = agents[parseInt(order.id.slice(-1)) % 5] || agents[0];
    
    // Generate contact
    const agentContact = '+91 9' + Math.floor(Math.random() * 900000000 + 100000000).toString().slice(0, 9);
    
    // Generate tracking number
    const trackingNumber = 'TRK' + order.id.slice(-8) + Date.now().toString().slice(-4);
    
    return {
        deliveryDate: formattedDate,
        timeWindow: timeWindow,
        agentName: agentName,
        agentContact: agentContact,
        trackingNumber: trackingNumber,
        statuses: statuses,
        currentStep: currentStep
    };
}

// Update the renderOrders function with fixed images
function renderOrders() {
    const ordersList = document.querySelector('.orders-list');
    if (!ordersList) return;
    
    const userData = window.userData;
    
    if (!userData || !userData.orders || userData.orders.length === 0) {
        ordersList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-bag"></i>
                <h3>No Orders Yet</h3>
                <p>You haven't placed any orders yet.</p>
                <a href="#" class="btn" id="start-shopping">Start Shopping</a>
            </div>
        `;
        return;
    }
    
    let ordersHTML = '';
    
    userData.orders.forEach(order => {
        let itemsHTML = '';
        
        // Show only first 2 items with a count for more
        const displayItems = order.items.slice(0, 2);
        const remainingCount = order.items.length - 2;
        
        displayItems.forEach(item => {
            const imageUrl = item.image && item.image.startsWith('http') 
                ? item.image 
                : (item.image ? window.location.origin + '/' + item.image : 'https://via.placeholder.com/50x50/4CAF50/ffffff?text=🍎');
            
            itemsHTML += `
                <div class="order-item-preview">
                    <img src="${imageUrl}" 
                         alt="${item.name}"
                         onerror="this.src='https://via.placeholder.com/50x50/4CAF50/ffffff?text=🍎'">
                    <div class="item-info">
                        <div class="item-name">${item.name}</div>
                        <div class="item-meta">${item.weight || '500g'} × ${item.quantity}</div>
                    </div>
                    <div class="item-price">₹${(item.price * item.quantity).toFixed(2)}</div>
                </div>
            `;
        });
        
        if (remainingCount > 0) {
            itemsHTML += `
                <div class="more-items">
                    +${remainingCount} more item${remainingCount > 1 ? 's' : ''}
                </div>
            `;
        }
        
        ordersHTML += `
            <div class="order-card" data-order-id="${order.id}">
                <div class="order-header">
                    <div>
                        <h4>Order #${order.id}</h4>
                        <span class="order-date">${order.date || ''} ${order.time || ''}</span>
                    </div>
                    <div class="order-status" style="background: ${order.status === 'delivered' ? '#e8f5e9' : '#fff3e0'}; color: ${order.status === 'delivered' ? '#2e7d32' : '#f57c00'};">
                        ${order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Confirmed'}
                    </div>
                </div>
                
                <div class="order-items">
                    ${itemsHTML}
                </div>
                
                <div class="order-footer">
                    <div class="order-total">
                        Total: <span>₹${(order.total || 0).toFixed(2)}</span>
                    </div>
                    <div class="order-actions">
                        <button class="btn-view-order" onclick="showOrderDetails('${order.id}')">
                            View Details
                        </button>
                        <button class="btn-track-order" onclick="showOrderTracking('${order.id}')">
                            Track Order
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    ordersList.innerHTML = ordersHTML;
}

// Add CSS styles for the order details view with fixed tracking timeline
function addOrderDetailsStyles() {
    if (!document.querySelector('#order-details-styles')) {
        const style = document.createElement('style');
        style.id = 'order-details-styles';
        style.textContent = `
            
        `;
        document.head.appendChild(style);
    }
}

// Call addOrderDetailsStyles in your initialization
addOrderDetailsStyles();

// Make sure renderOrders is called when orders are updated
function refreshOrdersDisplay() {
    renderOrders();
}

    // Update renderOrders function to use the panel
    function renderOrders() {
        const ordersList = document.querySelector('.orders-list');
        if (!ordersList) return;
        
        if (!userData.orders || userData.orders.length === 0) {
            ordersList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-shopping-bag"></i>
                    <h3>No Orders Yet</h3>
                    <p>You haven't placed any orders yet.</p>
                    <a href="#" class="btn" id="start-shopping">Start Shopping</a>
                </div>
            `;
            return;
        }
        
        let ordersHTML = '';
        
        userData.orders.forEach(order => {
            let itemsHTML = '';
            
            // Show only first 2 items with a count for more
            const displayItems = order.items.slice(0, 2);
            const remainingCount = order.items.length - 2;
            
            displayItems.forEach(item => {
                itemsHTML += `
                    <div style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
                        <img src="${item.image || 'https://via.placeholder.com/50x50'}" 
                             alt="${item.name}" 
                             style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; margin-right: 15px;">
                        <div style="flex: 1;">
                            <div style="font-weight: 500;">${item.name}</div>
                            <div style="color: #666; font-size: 14px;">
                                ${item.weight || '500g'} × ${item.quantity}
                            </div>
                        </div>
                        <div style="font-weight: bold; color: #2e7d32;">
                            ₹${(item.price * item.quantity).toFixed(2)}
                        </div>
                    </div>
                `;
            });
            
            if (remainingCount > 0) {
                itemsHTML += `
                    <div style="padding: 10px; text-align: center; color: #666; font-style: italic;">
                        +${remainingCount} more item${remainingCount > 1 ? 's' : ''}
                    </div>
                `;
            }
            
            ordersHTML += `
                <div class="order-card" style="border: 1px solid #ddd; border-radius: 8px; margin-bottom: 20px; overflow: hidden;">
                    <div style="background: #f5f5f5; padding: 15px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h4 style="margin: 0; color: #2e7d32;">Order #${order.id}</h4>
                            <span style="color: #666; font-size: 14px;">${order.date} ${order.time || ''}</span>
                        </div>
                        <div style="padding: 5px 15px; border-radius: 20px; font-weight: bold; background: ${order.status === 'delivered' ? '#e8f5e9' : '#fff3e0'}; color: ${order.status === 'delivered' ? '#2e7d32' : '#f57c00'};">
                            ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </div>
                    </div>
                    
                    <div style="padding: 15px;">
                        ${itemsHTML}
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #f9f9f9; border-top: 1px solid #ddd;">
                        <div style="font-size: 16px;">
                            Total: <span style="font-weight: bold; color: #2e7d32;">₹${order.total.toFixed(2)}</span>
                        </div>
                        <div>
                        </div>
                            <button class="btn-view-order" 
                                data-order-id="${order.id}" 
                                style="padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; background: #4CAF50; color: white; margin-right: 8px; outline: none; box-shadow: none;">
                                View Details
                            </button>
                          
                    </div>
                </div>
            `;
        });
        
        ordersList.innerHTML = ordersHTML;
        
        // Add event listeners for view details buttons
        document.querySelectorAll('.btn-view-order').forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const orderId = this.getAttribute('data-order-id');
                showOrderTracking(orderId);
            });
        });
        
        // Add event listeners for track order buttons
        document.querySelectorAll('.btn-track-order').forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const orderId = this.getAttribute('data-order-id');
                // Set URL parameter to show tracking view
                const url = new URL(window.location.href);
                url.searchParams.set('view', 'tracking');
                window.history.pushState({}, '', url);
                showOrderTracking(orderId);
            });
        });
    }

    // Add styles for the order panel
    function addOrderPanelStyles() {
        if (!document.querySelector('#order-panel-styles')) {
            const style = document.createElement('style');
            style.id = 'order-panel-styles';
            style.textContent = `
               
            `;
            document.head.appendChild(style);
        }
    }

    // ===== COUPON FUNCTIONALITY =====
    function setupCouponEvents() {
        document.addEventListener('click', function(e) {
            if (e.target.id === 'apply-coupon' || e.target.closest('#apply-coupon')) {
                applyCoupon();
            }
            
            if (e.target.id === 'remove-coupon' || e.target.closest('#remove-coupon')) {
                removeCoupon();
            }
        });
        
        const couponCodeInput = document.getElementById('coupon-code');
        if (couponCodeInput) {
            couponCodeInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyCoupon();
                }
            });
        }
    }

    // ===== LAZY LOADING FUNCTIONALITY =====
    function setupLazyLoading() {
        initializeLazyLoading();
    }

    function initializeLazyLoading() {
        const lazyImages = [].slice.call(document.querySelectorAll("img.lazy-img"));
        
        if ("IntersectionObserver" in window) {
            let lazyImageObserver = new IntersectionObserver(function(entries, observer) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        let lazyImage = entry.target;
                        const dataSrc = lazyImage.getAttribute('data-src');
                        if (dataSrc) {
                            lazyImage.src = dataSrc;
                            lazyImage.classList.remove("lazy-img");
                            lazyImage.onload = function() {
                                lazyImage.classList.add("loaded");
                            };
                            lazyImage.onerror = function() {
                                lazyImage.classList.add("error");
                            };
                            lazyImageObserver.unobserve(lazyImage);
                        }
                    }
                });
            }, {
                rootMargin: "200px 0px"
            });

            lazyImages.forEach(function(lazyImage) {
                lazyImageObserver.observe(lazyImage);
            });
        } else {
            lazyImages.forEach(function(lazyImage) {
                const dataSrc = lazyImage.getAttribute('data-src');
                if (dataSrc) {
                    lazyImage.src = dataSrc;
                    lazyImage.classList.remove("lazy-img");
                    lazyImage.onload = function() {
                        lazyImage.classList.add("loaded");
                    };
                    lazyImage.onerror = function() {
                        lazyImage.classList.add("error");
                    };
                }
            });
        }

        const hero = document.querySelector('.hero');
        if (hero) {
            hero.style.backgroundImage = 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url("https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80")';
        }
    }

    // ===== OTP FUNCTIONALITY =====
    function simulateOtpSend(method = null) {
        currentOtp = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`Demo OTP sent via ${method || 'selected method'}: ${currentOtp}`);
        
        const otpInputs = document.querySelectorAll('.otp-input');
        otpInputs.forEach((input, index) => {
            if (index < 6) {
                input.value = currentOtp[index];
            }
        });
        
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) loginBtn.style.display = 'block';
        
        startOtpTimer();
        showToastMessage(`OTP sent to your ${method || 'selected method'}`);
    }

    function showOtpSection() {
        const otpSection = document.getElementById('otp-section');
        const getOtpBtn = document.getElementById('get-otp-btn');
        
        if (otpSection) otpSection.style.display = 'block';
        if (getOtpBtn) getOtpBtn.style.display = 'none';
    }

    function startOtpTimer() {
        const timerElement = document.getElementById('timer');
        if (!timerElement) return;
        
        let timeLeft = 120;
        
        if (otpTimer) clearInterval(otpTimer);
        
        otpTimer = setInterval(() => {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            if (timeLeft <= 0) {
                clearInterval(otpTimer);
                timerElement.textContent = '00:00';
                timerElement.style.color = '#e53935';
                currentOtp = '';
            }
        }, 1000);
    }

    // ===== LOGOUT HANDLING =====
    function handleLogout() {
        userData.isLoggedIn = false;
        saveUserData();
        showPage('login');
        showToastMessage('Logged out successfully!');
    }

    // ===== CART FUNCTIONALITY =====
    function addToCart(productId, selectedQuantity) {
        if (!productDatabase[productId]) {
            console.error(`Product ID ${productId} not found`);
            return;
        }
        
        const product = productDatabase[productId];
        const existingItemIndex = userData.cart.findIndex(item => item.id === productId && item.quantityOption === selectedQuantity);
        
        if (existingItemIndex > -1) {
            userData.cart[existingItemIndex].quantity += 1;
        } else {
            userData.cart.push({
                id: productId,
                name: product.name,
                category: product.category,
                price: product.prices[selectedQuantity],
                quantity: 1,
                quantityOption: selectedQuantity,
                weight: product.weight[selectedQuantity],
                image: product.image,
                originalPrice: product.originalPrice,
                discount: product.discount
            });
        }
        
        saveUserData();
        updateCartCount();
        showToastMessage(`${product.name} (${product.weight[selectedQuantity]}) added to cart!`);
        
        if (pages.cart && pages.cart.classList.contains('active')) {
            renderCart();
        }
    }

    function updateCartQuantity(productId, change) {
        const itemIndex = userData.cart.findIndex(item => item.id === productId);
        if (itemIndex === -1) return;
        
        const item = userData.cart[itemIndex];
        
        if (item.quantity + change < 1) {
            removeFromCart(productId);
            return;
        }
        
        item.quantity += change;
        saveUserData();
        renderCart();
        updateCartCount();
        showToastMessage(`${item.name} quantity updated to ${item.quantity}`);
    }

    function removeFromCart(productId) {
        console.log('Attempting to remove product from cart:', productId);
        
        const itemIndex = userData.cart.findIndex(item => item.id === productId);
        if (itemIndex === -1) {
            console.error('Product not found in cart:', productId);
            return;
        }
        
        const removedItem = userData.cart[itemIndex];
        userData.cart.splice(itemIndex, 1);
        
        console.log('Removed item:', removedItem);
        console.log('Cart after removal:', userData.cart);
        
        saveUserData();
        renderCart();
        updateCartCount();
        showToastMessage(`${removedItem.name} removed from cart`);
    }

    function updateCartCount() {
        const cartCountElements = document.querySelectorAll('.cart-count');
        const totalItems = userData.cart.reduce((sum, item) => sum + item.quantity, 0);
        
        cartCountElements.forEach(element => {
            element.textContent = totalItems;
        });
    }

    function renderCart() {
        console.log('Rendering cart...');
        const cartItemsContainer = document.querySelector('.cart-items');
        const cartSummary = document.querySelector('.cart-summary');
        
        if (!cartItemsContainer || !cartSummary) {
            console.error('Cart container elements not found');
            return;
        }
        
        cartItemsContainer.innerHTML = '';
        cartSummary.innerHTML = '';
        
        if (!userData.cart || userData.cart.length === 0) {
            console.log('Cart is empty');
            cartItemsContainer.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart"></i>
                    <h3>Your Cart is Empty</h3>
                    <p>Add some organic goodness to your cart!</p>
                    <a href="#" class="btn" id="empty-cart-shop">Start Shopping</a>
                </div>
            `;
            
            cartSummary.innerHTML = `
                <h3>Order Summary</h3>
                <div class="summary-row">
                    <span>Subtotal</span>
                    <span id="cart-subtotal">₹0</span>
                </div>
                <div class="summary-row">
                    <span>Delivery</span>
                    <span id="cart-delivery">₹0</span>
                </div>
                <div class="summary-row">
                    <span>Tax</span>
                    <span id="cart-tax">₹0</span>
                </div>
                <div class="summary-row total">
                    <span>Total</span>
                    <span id="cart-total">₹0</span>
                </div>
                <button class="btn btn-checkout" id="checkout-btn" disabled>Proceed to Checkout</button>
            `;
            
            return;
        }
        
        console.log(`Rendering ${userData.cart.length} cart items`);

        userData.cart.forEach(item => {
            const product = productDatabase[item.id] || {};
            const weight = product.weight ? product.weight[item.quantityOption] || '' : '';
            const itemTotal = item.price * item.quantity;
            
            const cartItemHTML = `
                <div class="cart-item" data-product-id="${item.id}">
                    <img src="${item.image}" alt="${item.name}" class="cart-item-image">
                    <div class="cart-item-details">
                        <div class="cart-item-header">
                            <div>
                                <div class="cart-item-category">${item.category}</div>
                                <h3 class="cart-item-title">${item.name}</h3>
                                <div class="cart-item-weight">${weight}</div>
                            </div>
                            <div class="cart-item-price">₹${itemTotal}</div>
                        </div>
                        <div class="cart-item-actions">
                            <div class="quantity-controls">
                                <button class="quantity-btn quantity-decrease">-</button>
                                <span class="quantity">${item.quantity}</span>
                                <button class="quantity-btn quantity-increase">+</button>
                            </div>
                            <span class="item-unit-price">₹${item.price} per unit</span>
                            <button class="remove-item">Remove</button>
                        </div>
                    </div>
                </div>
            `;
            cartItemsContainer.innerHTML += cartItemHTML;
        });
        
        const totals = calculateCartTotals();
        
        cartSummary.innerHTML = `
            <h3>Order Summary</h3>
            <div class="summary-row">
                <span>Subtotal</span>
                <span id="cart-subtotal">₹${totals.subtotal}</span>
            </div>
            <div class="summary-row">
                <span>Delivery</span>
                <span id="cart-delivery">${totals.delivery === 0 ? 'Free' : `₹${totals.delivery}`}</span>
            </div>
            <div class="summary-row">
                <span>Tax</span>
                <span id="cart-tax">₹${totals.tax.toFixed(2)}</span>
            </div>
            ${activeCoupon ? `
                <div class="summary-row coupon-applied">
                    <span>Coupon Discount (${activeCoupon.code})</span>
                    <span>-₹${totals.couponDiscount.toFixed(2)}</span>
                </div>
            ` : ''}
            <div class="coupon-section" style="margin-top: 16px;">
                <div class="coupon-input" style="display: flex; align-items: center; gap: 10px;">
                    <input 
                        type="text"
                        id="coupon-code"
                        placeholder="Enter coupon code"
                        value="${activeCoupon ? activeCoupon.code : ''}"
                        style="
                          
                        "
                    >
                    <button 
                        id="apply-coupon"
                        style="
                           
                        "
                    >
                        ${activeCoupon ? 'Change' : 'Apply'}
                    </button>
                    ${activeCoupon ? `
                    <button 
                        id="remove-coupon"
                        style="
                          
                        "
                    >
                        Remove
                    </button>` : ''}
                </div>
                <div id="coupon-message" class="coupon-message"></div>
            </div>
            <div class="summary-row total">
                <span>Total</span>
                <span id="cart-total">₹${totals.total.toFixed(2)}</span>
            </div>
            <button class="btn btn-checkout" id="checkout-btn">Proceed to Checkout</button>
        `;
        
        const cartItemsCount = document.getElementById('cart-items-count');
        if (cartItemsCount) {
            const totalItems = userData.cart.reduce((sum, item) => sum + item.quantity, 0);
            cartItemsCount.textContent = `${totalItems} ${totalItems === 1 ? 'item' : 'items'}`;
        }
        
        console.log('Cart rendered successfully');
    }

    function calculateCartTotals() {
        if (!userData.cart || userData.cart.length === 0) {
            return {
                subtotal: 0,
                delivery: 0,
                tax: 0,
                couponDiscount: 0,
                total: 0
            };
        }
        
        const subtotal = userData.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        // Use dynamic delivery charge if calculated, otherwise fallback to free shipping threshold
        const delivery = deliveryCharge > 0 ? deliveryCharge : (subtotal > 499 ? 0 : 50);
        const tax = subtotal * 0.05;
        
        let couponDiscount = 0;
        if (activeCoupon) {
            const coupon = couponDatabase[activeCoupon.code];
            if (coupon) {
                if (coupon.type === 'percentage') {
                    couponDiscount = Math.min((subtotal * coupon.discount) / 100, coupon.maxDiscount);
                } else if (coupon.type === 'fixed') {
                    couponDiscount = Math.min(coupon.discount, coupon.maxDiscount);
                } else if (coupon.type === 'shipping') {
                    couponDiscount = delivery;
                }
            }
        }
        
        const total = Math.max(0, subtotal + delivery + tax - couponDiscount);
        
        return {
            subtotal,
            delivery,
            tax,
            couponDiscount,
            total
        };
    }

    // ===== COUPON HANDLING =====
    function applyCoupon() {
        const couponCodeInput = document.getElementById('coupon-code');
        if (!couponCodeInput) return;
        
        const couponCode = couponCodeInput.value.trim().toUpperCase();
        const messageEl = document.getElementById('coupon-message');
        
        if (!couponCode) {
            showCouponMessage('Please enter a coupon code', 'error');
            return;
        }
        
        if (couponDatabase[couponCode]) {
            const coupon = couponDatabase[couponCode];
            const subtotal = userData.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            if (subtotal >= coupon.minAmount) {
                activeCoupon = {
                    code: couponCode,
                    discount: coupon.discount,
                    type: coupon.type,
                    minAmount: coupon.minAmount,
                    maxDiscount: coupon.maxDiscount,
                    description: coupon.description
                };
                
                showCouponMessage(`Coupon "${couponCode}" applied successfully! ${coupon.description}`, 'success');
                
                if (pages.cart && pages.cart.classList.contains('active')) {
                    renderCart();
                }
                if (pages.checkout && pages.checkout.classList.contains('active')) {
                    updateCheckoutSummary();
                }
            } else {
                showCouponMessage(`Minimum order amount ₹${coupon.minAmount} required for this coupon`, 'error');
            }
        } else {
            showCouponMessage('Invalid coupon code', 'error');
        }
    }

    function removeCoupon() {
        activeCoupon = null;
        showCouponMessage('Coupon removed', 'info');
        
        if (pages.cart && pages.cart.classList.contains('active')) {
            renderCart();
        }
        if (pages.checkout && pages.checkout.classList.contains('active')) {
            updateCheckoutSummary();
        }
    }

    function showCouponMessage(message, type) {
        const messageEl = document.getElementById('coupon-message');
        if (messageEl) {
            messageEl.textContent = message;
            messageEl.className = `coupon-message ${type}`;
            
            setTimeout(() => {
                messageEl.textContent = '';
                messageEl.className = 'coupon-message';
            }, 4000);
        }
    }

    // ===== WISHLIST FUNCTIONALITY =====
    function addToWishlist(productId) {
        if (!productDatabase[productId]) {
            console.error(`Product ID ${productId} not found`);
            return;
        }
        
        const product = productDatabase[productId];
        const existingItemIndex = userData.wishlist.findIndex(item => item.id === productId);
        
        if (existingItemIndex === -1) {
            userData.wishlist.push({
                id: productId,
                name: product.name,
                category: product.category,
                price: product.prices[1],
                image: product.image,
                originalPrice: product.originalPrice,
                discount: product.discount,
                addedDate: new Date().toISOString()
            });
            
            saveUserData();
            showToastMessage(`${product.name} added to wishlist!`);
        } else {
            showToastMessage(`${product.name} is already in your wishlist`);
        }
    }

    function moveToWishlist(productId) {
        const cartItemIndex = userData.cart.findIndex(item => item.id === productId);
        if (cartItemIndex === -1) return;
        
        const cartItem = userData.cart[cartItemIndex];
        const product = productDatabase[productId];
        
        addToWishlist(productId);
        
        userData.cart.splice(cartItemIndex, 1);
        
        saveUserData();
        renderCart();
        updateCartCount();
        showToastMessage(`${product.name} moved to wishlist`);
    }

    function saveForLater(productId) {
        const product = productDatabase[productId];
        if (product) {
            showToastMessage(`${product.name} saved for later`);
        }
    }

    // ===== PROFILE FUNCTIONALITY =====
    function loadProfileData() {
        if (!userData.isLoggedIn) return;
        
        const profileName = document.getElementById('profile-name');
        const profileEmail = document.getElementById('profile-email');
        
        if (profileName) profileName.textContent = userData.name;
        if (profileEmail) profileEmail.textContent = userData.email;
        
        const fullnameInput = document.getElementById('profile-fullname');
        const phoneInput = document.getElementById('profile-phone');
        const emailInput = document.getElementById('profile-email');
        
        if (fullnameInput) fullnameInput.value = userData.name;
        if (phoneInput) phoneInput.value = userData.phone;
        if (emailInput) emailInput.value = userData.email;
        
        renderAddresses();
        renderOrders();
        renderWishlist();
    }

    function saveProfile() {
        const name = document.getElementById('profile-fullname').value;
        const phone = document.getElementById('profile-phone').value;
        const email = document.getElementById('profile-email').value;
        
        userData.name = name;
        userData.phone = phone;
        userData.email = email;
        
        saveUserData();
        updateUserProfile();
        showToastMessage('Profile updated successfully!');
    }

    function updateUserProfile() {
        const profileName = document.getElementById('profile-name');
        const profileEmail = document.getElementById('profile-email');
        
        if (profileName) profileName.textContent = userData.name;
        if (profileEmail) profileEmail.textContent = userData.email;
    }

    function showAddAddressModal() {
        const modal = document.getElementById('add-address-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    function hideAddAddressModal() {
        const modal = document.getElementById('add-address-modal');
        if (modal) {
            modal.style.display = 'none';
            const form = document.getElementById('add-address-form');
            if (form) form.reset();
        }
    }

    function saveAddress() {
        const name = document.getElementById('address-name').value;
        const fullName = document.getElementById('address-fullname').value;
        const phone = document.getElementById('address-phone').value;
        const street = document.getElementById('address-street').value;
        const city = document.getElementById('address-city').value;
        const pincode = document.getElementById('address-pincode').value;
        const state = document.getElementById('address-state').value;
        const isDefault = document.getElementById('default-address').checked;
        
        const newAddress = {
            id: Date.now(),
            name,
            fullName,
            phone,
            street,
            city,
            pincode,
            state,
            default: isDefault
        };
        
        if (isDefault) {
            userData.addresses.forEach(addr => addr.default = false);
        }
        
        userData.addresses.push(newAddress);
        saveUserData();
        hideAddAddressModal();
        renderAddresses();
        syncAddressesToCheckout();
        showToastMessage('Address saved successfully!');
    }
// ===== ADDRESS MANAGEMENT FIXES =====

// Variable to track if we're editing an address
let isEditingAddress = false;
let editingAddressId = null;

// Fix the editAddress function to use the existing form
function editAddress(addressId) {
    const address = userData.addresses.find(addr => addr.id === addressId);
    if (!address) {
        console.error('Address not found:', addressId);
        return;
    }
    
    // Store editing state
    isEditingAddress = true;
    editingAddressId = addressId; // Fixed: Changed from EditingAddressId to editingAddressId
    
    // Get the address form container
    const addressFormContainer = document.getElementById('address-form-container');
    const addressForm = document.getElementById('address-form');
    
    if (!addressFormContainer || !addressForm) {
        console.error('Address form container not found');
        return;
    }
    
    // Change the heading to indicate editing
    const formHeading = addressFormContainer.querySelector('h3');
    if (formHeading) {
        formHeading.textContent = 'Edit Address';
    }
    
    // Change the save button text
    const saveBtn = document.getElementById('save-address-btn');
    if (saveBtn) {
        saveBtn.textContent = 'Update Address';
    }
    
    // Populate form with address data
    document.getElementById('delivery-name').value = address.fullName || address.name || '';
    document.getElementById('delivery-phone').value = address.phone || '';
    document.getElementById('delivery-address').value = address.street || '';
    document.getElementById('delivery-city').value = address.city || '';
    document.getElementById('delivery-pincode').value = address.pincode || '';
    document.getElementById('delivery-state').value = address.state || '';
    
    // Set address type radio based on address name
    const addressTypeRadios = document.querySelectorAll('input[name="address_type"]');
    addressTypeRadios.forEach(radio => {
        if (radio.value.toLowerCase() === (address.name || '').toLowerCase()) {
            radio.checked = true;
        } else if (address.name === 'Home' && radio.value === 'Home') {
            radio.checked = true;
        } else if (address.name === 'Office' && radio.value === 'Office') {
            radio.checked = true;
        }
    });
    
    // Show the form
    addressFormContainer.style.display = 'block';
    addressFormContainer.scrollIntoView({ behavior: 'smooth' });
}

// Update the save address function to handle both add and edit
function saveAddress() {
    // Get form values
    const name = document.getElementById('delivery-name').value.trim();
    const phone = document.getElementById('delivery-phone').value.trim();
    const street = document.getElementById('delivery-address').value.trim();
    const city = document.getElementById('delivery-city').value.trim();
    const pincode = document.getElementById('delivery-pincode').value.trim();
    const state = document.getElementById('delivery-state').value.trim();
    
    // Get address type
    const addressTypeRadio = document.querySelector('input[name="address_type"]:checked');
    const addressType = addressTypeRadio ? addressTypeRadio.value : 'Home';
    
    // Validate form
    if (!name || !phone || !street || !city || !pincode || !state) {
        showToastMessage('Please fill all address fields');
        return false;
    }
    
    // Validate phone
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
        showToastMessage('Please enter a valid 10-digit phone number');
        return false;
    }
    
    // Validate pincode
    const pincodeDigits = pincode.replace(/\D/g, '');
    if (pincodeDigits.length !== 6) {
        showToastMessage('Please enter a valid 6-digit pincode');
        return false;
    }
    
    if (isEditingAddress && editingAddressId) {
        // Update existing address
        const addressIndex = userData.addresses.findIndex(addr => addr.id === editingAddressId);
        if (addressIndex !== -1) {
            // Preserve the default status
            const wasDefault = userData.addresses[addressIndex].default;
            
            userData.addresses[addressIndex] = {
                ...userData.addresses[addressIndex],
                name: addressType,
                fullName: name,
                phone: phoneDigits,
                street: street,
                city: city,
                pincode: pincodeDigits,
                state: state,
                default: wasDefault
            };
            
            showToastMessage('Address updated successfully!');
        }
    } else {
        // Add new address
        const newAddress = {
            id: Date.now(),
            name: addressType,
            fullName: name,
            phone: phoneDigits,
            street: street,
            city: city,
            pincode: pincodeDigits,
            state: state,
            default: userData.addresses.length === 0 // First address is default
        };
        
        userData.addresses.push(newAddress);
        showToastMessage('Address saved successfully!');
    }
    
    // Save to localStorage
    saveUserData();
    
    // Refresh displays
    renderAddresses();
    syncAddressesToCheckout();
    
    // Reset form and hide after successful save
    resetAddressForm();
    hideAddressForm();
    
    return true;
}

// Function to reset address form
function resetAddressForm() {
    const addressForm = document.getElementById('address-form');
    if (addressForm) {
        addressForm.reset();
    }
    
    // Reset editing state
    isEditingAddress = false;
    editingAddressId = null;
    
    // Reset heading
    const formHeading = document.querySelector('#address-form-container h3');
    if (formHeading) {
        formHeading.textContent = 'Add New Address';
    }
    
    // Reset save button text
    const saveBtn = document.getElementById('save-address-btn');
    if (saveBtn) {
        saveBtn.textContent = 'Save Address';
    }
}

// Function to hide address form
function hideAddressForm() {
    const addressFormContainer = document.getElementById('address-form-container');
    if (addressFormContainer) {
        addressFormContainer.style.display = 'none';
    }
}

// Cancel address function
window.cancelAddressForm = function() {
    console.log('Cancel address form called');
    resetAddressForm();
    hideAddressForm();
}

// Delete address function with confirmation
function deleteAddress(addressId) {
    // Create delete confirmation if it doesn't exist
    if (!document.getElementById('delete-address-confirm')) {
        const confirmDiv = document.createElement('div');
        confirmDiv.id = 'delete-address-confirm';
        confirmDiv.className = 'delete-confirm-overlay';
        confirmDiv.innerHTML = `
            <div class="delete-confirm-box">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f44336; margin-bottom: 15px;"></i>
                <h3>Delete Address</h3>
                <p>Are you sure you want to delete this address?</p>
                <p style="color: #666; font-size: 14px; margin-bottom: 20px;">This action cannot be undone.</p>
                <div class="delete-confirm-actions">
                    <button class="btn-danger" onclick="confirmDeleteAddress(${addressId})">Delete</button>
                    <button class="btn-secondary" onclick="closeDeleteConfirm()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmDiv);
        
        // Add styles for delete confirmation
        addDeleteConfirmStyles();
    } else {
        // Update the confirm button with the new address ID
        const confirmBtn = document.querySelector('#delete-address-confirm .btn-danger');
        if (confirmBtn) {
            confirmBtn.setAttribute('onclick', `confirmDeleteAddress(${addressId})`);
        }
    }
    
    // Show confirmation
    document.getElementById('delete-address-confirm').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Function to confirm delete
window.confirmDeleteAddress = function(addressId) {
    userData.addresses = userData.addresses.filter(addr => addr.id !== addressId);
    saveUserData();
    
    // Refresh displays
    renderAddresses();
    syncAddressesToCheckout();
    
    // Close confirmation
    closeDeleteConfirm();
    
    showToastMessage('Address deleted successfully!');
}

// Function to close delete confirmation
window.closeDeleteConfirm = function() {
    const confirmDiv = document.getElementById('delete-address-confirm');
    if (confirmDiv) {
        confirmDiv.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Add styles for delete confirmation
function addDeleteConfirmStyles() {
    if (!document.querySelector('#delete-confirm-styles')) {
        const style = document.createElement('style');
        style.id = 'delete-confirm-styles';
        style.textContent = `
           
        `;
        document.head.appendChild(style);
    }
}

// Event handler functions
function handleEditClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const addressId = parseInt(this.getAttribute('data-address-id'));
    editAddress(addressId);
}

function handleDeleteClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const addressId = parseInt(this.getAttribute('data-address-id'));
    deleteAddress(addressId);
}

function handleSetDefaultClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const addressId = parseInt(this.getAttribute('data-address-id'));
    setDefaultAddress(addressId);
}

function handleAddNewClick(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('Add new address button clicked');
    resetAddressForm();
    const addressFormContainer = document.getElementById('address-form-container');
    if (addressFormContainer) {
        addressFormContainer.style.display = 'block';
        addressFormContainer.scrollIntoView({ behavior: 'smooth' });
    }
}

function handleCancelClick(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('Cancel button clicked');
    window.cancelAddressForm();
}

// Function to attach all address action listeners
function attachAddressActionListeners() {
    console.log('Attaching address action listeners');
    
    // Edit address buttons
    document.querySelectorAll('.btn-edit-address').forEach(btn => {
        btn.removeEventListener('click', handleEditClick);
        btn.addEventListener('click', handleEditClick);
    });
    
    // Delete address buttons
    document.querySelectorAll('.btn-delete-address').forEach(btn => {
        btn.removeEventListener('click', handleDeleteClick);
        btn.addEventListener('click', handleDeleteClick);
    });
    
    // Set default address buttons
    document.querySelectorAll('.btn-set-default').forEach(btn => {
        btn.removeEventListener('click', handleSetDefaultClick);
        btn.addEventListener('click', handleSetDefaultClick);
    });
    
    // Add new address button
    const addNewAddressBtn = document.getElementById('add-new-address-btn');
    if (addNewAddressBtn) {
        console.log('Add new address button found, attaching listener');
        addNewAddressBtn.removeEventListener('click', handleAddNewClick);
        addNewAddressBtn.addEventListener('click', handleAddNewClick);
    } else {
        console.log('Add new address button not found');
    }
    
    // Cancel address button
    const cancelAddressBtn = document.getElementById('cancel-address-btn');
    if (cancelAddressBtn) {
        console.log('Cancel button found, attaching listener');
        cancelAddressBtn.removeEventListener('click', handleCancelClick);
        cancelAddressBtn.addEventListener('click', handleCancelClick);
    }
}

// Make functions globally available
window.editAddress = editAddress;
window.deleteAddress = deleteAddress;
window.setDefaultAddress = setDefaultAddress;
window.saveAddress = saveAddress;

// Update the renderAddresses function to ensure proper button styling
function renderAddresses() {
    console.log('Rendering addresses');
    
    // Find all possible address containers
    const profileAddressesContainer = document.querySelector('.profile-tab#addresses .addresses-list');
    const addressesContainer = document.getElementById('addresses-container');
    
    // Use the container that exists (prefer profile addresses container)
    const container = profileAddressesContainer || addressesContainer;
    
    if (!container) {
        console.warn('Addresses container not found');
        return;
    }
    
    if (!userData.addresses || userData.addresses.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-map-marker-alt"></i>
                <h3>No Addresses Saved</h3>
                <p>You haven't saved any addresses yet.</p>
                <button id="add-new-address-btn" class="btn-secondary">
                    <i class="fas fa-plus"></i> Add New Address
                </button>
            </div>
        `;
        
        // Attach listener to the new button after a short delay
        setTimeout(() => {
            const newBtn = document.getElementById('add-new-address-btn');
            if (newBtn) {
                console.log('Attaching listener to new add button');
                newBtn.removeEventListener('click', handleAddNewClick);
                newBtn.addEventListener('click', handleAddNewClick);
            }
        }, 100);
        
        return;
    }
    
    container.innerHTML = '';
    
    // Create address cards
    userData.addresses.forEach(address => {
        const addressCard = document.createElement('div');
        addressCard.className = `address-card ${address.default ? 'default-address' : ''}`;
        addressCard.dataset.addressId = address.id;
        
        // Determine icon based on address name
        let icon = '🏠';
        if (address.name === 'Office' || address.name === 'Work') {
            icon = '🏢';
        } else if (address.name === 'Other') {
            icon = '📍';
        }
        
        addressCard.innerHTML = `
            <div class="address-header">
                <h3 style="font-size: 1.3rem; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                    <span>${icon}</span> ${address.name} 
                    ${address.default ? '<span class="default-badge" style="font-size: 0.9rem; padding: 4px 12px; background: #4CAF50; color: white; border-radius: 20px; margin-left: 10px;">Default</span>' : ''}
                </h3>
                <div class="address-actions" style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <button class="btn-edit-address" data-address-id="${address.id}" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn-delete-address" data-address-id="${address.id}" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                    ${!address.default ? `
                    <button class="btn-set-default" data-address-id="${address.id}" style="padding: 8px 16px; background: #ff9800; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-check-circle"></i> Set Default
                    </button>
                    ` : ''}
                </div>
            </div>
            <div class="address-details" style="font-size: 1.1rem; line-height: 1.8; padding: 0 10px;">
                <p style="margin-bottom: 8px;"><strong style="font-size: 1.2rem;">${address.fullName || address.name}</strong></p>
                <p style="margin-bottom: 8px;">📍 ${address.street}</p>
                <p style="margin-bottom: 8px;">🏙️ ${address.city}, ${address.state} - ${address.pincode}</p>
                <p style="margin-bottom: 8px;">📞 Phone: ${address.phone}</p>
            </div>
        `;
        
        container.appendChild(addressCard);
    });
    
    // Add "Add New Address" button at the bottom
    const addButtonContainer = document.createElement('div');
    addButtonContainer.className = 'add-address-container';
    addButtonContainer.style.marginTop = '20px';
    addButtonContainer.style.textAlign = 'center';
    addButtonContainer.innerHTML = `
        <button id="add-new-address-btn" class="btn-primary">
    <span class="plus-icon">+</span>
    <span>Add New Address</span>
</button>
    `;
    container.appendChild(addButtonContainer);
    
    // Re-attach event listeners after a short delay to ensure DOM is updated
    setTimeout(() => {
        attachAddressActionListeners();
    }, 100);
}

// Update the setDefaultAddress function
function setDefaultAddress(addressId) {
    userData.addresses.forEach(addr => {
        addr.default = (addr.id === addressId);
    });
    saveUserData();
    
    // Refresh displays
    renderAddresses();
    syncAddressesToCheckout();
    
    showToastMessage('Default address updated!');
}

// Combined global click handler using event delegation
document.addEventListener('click', function(e) {
    const target = e.target;
    const id = target.id || (target.closest('button') ? target.closest('button').id : null);
    
    // Save button
    if (id === 'save-address-btn' || target.closest('#save-address-btn')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Save/Update button clicked');
        saveAddress();
    }
    
    // Cancel button
    if (id === 'cancel-address-btn' || target.closest('#cancel-address-btn')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Cancel button clicked via global handler');
        window.cancelAddressForm();
    }
    
    // Add new address button
    if (id === 'add-new-address-btn' || target.closest('#add-new-address-btn')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Add new address button clicked via global handler');
        resetAddressForm();
        const addressFormContainer = document.getElementById('address-form-container');
        if (addressFormContainer) {
            addressFormContainer.style.display = 'block';
            addressFormContainer.scrollIntoView({ behavior: 'smooth' });
        }
    }
});

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing address management');
    
    // Add styles
    addDeleteConfirmStyles();
    
    // Initial attachment of listeners
    setTimeout(function() {
        attachAddressActionListeners();
        console.log('Initial address action listeners attached');
    }, 500);
});

// Function to call when profile tab is shown
window.onProfileTabShown = function() {
    console.log('Profile tab shown, re-attaching address listeners');
    setTimeout(function() {
        attachAddressActionListeners();
    }, 200);
}
    function renderWishlist() {
        const wishlistContainer = document.getElementById('wishlist-container');
        if (!wishlistContainer) return;
        
        if (!userData.wishlist || userData.wishlist.length === 0) {
            wishlistContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-heart"></i>
                    <h3>Your Wishlist is Empty</h3>
                    <p>Add items you love to your wishlist</p>
                    <a href="#" class="btn" id="browse-products">Browse Products</a>
                </div>
            `;
            return;
        }
        
        wishlistContainer.innerHTML = userData.wishlist.map(item => {
            const product = productDatabase[item.id];
            return `
                <div class="wishlist-item">
                    <img src="${item.image}" alt="${item.name}">
                    <div class="wishlist-item-details">
                        <h4>${item.name}</h4>
                        <div class="wishlist-item-price">
                            <span class="current-price">₹${item.price}</span>
                            <span class="original-price">₹${item.originalPrice}</span>
                            <span class="discount">${item.discount}% off</span>
                        </div>
                        <div class="wishlist-item-actions">
                            <button class="btn-add-to-cart" data-product-id="${item.id}">Add to Cart</button>
                            <button class="btn-remove-wishlist" data-product-id="${item.id}">Remove</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ===== CHECKOUT FUNCTIONS =====
    function updateCheckoutSummary() {
        const totals = calculateCartTotals();
        
        const summaryElements = [
            { id: 'checkout-subtotal', value: `₹${totals.subtotal}` },
            { id: 'checkout-delivery', value: totals.delivery === 0 ? 'Free' : `₹${totals.delivery}` },
            { id: 'checkout-tax', value: `₹${totals.tax.toFixed(2)}` },
            { id: 'checkout-coupon', value: activeCoupon ? `-₹${totals.couponDiscount.toFixed(2)}` : '₹0' },
            { id: 'checkout-total', value: `₹${totals.total.toFixed(2)}` },
            { id: 'confirm-total', value: `₹${totals.total.toFixed(2)}` }
        ];
        
        summaryElements.forEach(item => {
            const element = document.getElementById(item.id);
            if (element) {
                element.textContent = item.value;
            }
        });
        
        const couponRow = document.getElementById('checkout-coupon-row');
        if (couponRow) {
            couponRow.style.display = activeCoupon ? 'flex' : 'none';
        }
    }

    function navigateToStep(step) {
        console.log('Navigating to step:', step);
        
        if (step === 'payment') {
            if (!validateCurrentAddress()) {
                showError('address-error', 'Please select or enter a valid address');
                return;
            }
            // IMPORTANT FIX: Generate order ID when entering payment step
            // This ensures the QR code and payment use the same ID
            ensureOrderId();
            
            // Update all order ID displays
            displayOrderId(currentOrderId);
            
            // If UPI is selected, regenerate QR with the correct order ID
            const upiPaymentRadio = document.getElementById('upi-payment');
            if (upiPaymentRadio && upiPaymentRadio.checked) {
                // Small delay to ensure DOM is ready
                setTimeout(() => {
                    if (!isQRGenerated) {
                        initializeUPIPayment();
                    } else {
                        // Regenerate QR with correct order ID
                        generateQRCode();
                    }
                }, 100);
            }
        }
        
        if (step === 'confirmation') {
            // Process order before showing confirmation
            processOrder();
            return;
        }
        
        const checkoutSteps = document.querySelectorAll('.checkout-step');
        checkoutSteps.forEach(stepElement => {
            stepElement.classList.remove('active');
        });
        
        const currentStepElement = document.getElementById(`${step}-step`);
        if (currentStepElement) {
            currentStepElement.classList.add('active');
            updateStepIndicators(step);
            currentStepElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function validateCurrentAddress() {
        const selectedAddress = document.querySelector('input[name="saved-address"]:checked');
        if (!selectedAddress) {
            showError('address-error', 'Please select a delivery address');
            return false;
        }
        
        if (selectedAddress.value === 'new') {
            const name = document.getElementById('delivery-name').value;
            const phone = document.getElementById('delivery-phone').value;
            const address = document.getElementById('delivery-address').value;
            const city = document.getElementById('delivery-city').value;
            const pincode = document.getElementById('delivery-pincode').value;
            const state = document.getElementById('delivery-state').value;
            
            if (!name || !phone || !address || !city || !pincode || !state) {
                showError('address-error', 'Please fill all address fields');
                return false;
            }
            
            if (!validatePhone(phone.replace(/\D/g, ''))) {
                showError('address-error', 'Please enter a valid phone number');
                return false;
            }
            
            hideError('address-error');
            return true;
        } else {
            hideError('address-error');
            return true;
        }
    }

function processOrder() {
    // Prevent multiple simultaneous order processing
    if (isProcessingOrder) {
        console.log('Order already being processed, ignoring duplicate call');
        return;
    }
    
    isProcessingOrder = true;
    console.log('Processing order...');
    console.log('processOrder - currentOrderId (before) =', currentOrderId);
    
    const selectedAddress = document.querySelector('input[name="saved-address"]:checked');
    let addressData;
    
    if (!selectedAddress) {
        console.error('No address selected');
        alert('Please select or enter a delivery address');
        isProcessingOrder = false;
        return;
    }
    
    if (selectedAddress.value === 'new') {
        const name = document.getElementById('delivery-name').value;
        const phone = document.getElementById('delivery-phone').value;
        const address = document.getElementById('delivery-address').value;
        const city = document.getElementById('delivery-city').value;
        const pincode = document.getElementById('delivery-pincode').value;
        const state = document.getElementById('delivery-state').value;
        
        if (!name || !phone || !address || !city || !pincode || !state) {
            console.error('Incomplete address form');
            alert('Please fill all address fields');
            isProcessingOrder = false;
            return;
        }
        
        addressData = {
            name: name,
            phone: phone,
            address: address,
            city: city,
            pincode: pincode,
            state: state
        };
        
        if (document.getElementById('save-address').checked) {
            const newAddress = {
                id: Date.now(),
                name: addressData.name,
                fullName: addressData.name,
                phone: addressData.phone,
                street: addressData.address,
                city: addressData.city,
                pincode: addressData.pincode,
                state: addressData.state,
                default: false
            };
            
            userData.addresses.push(newAddress);
            saveUserData();
            syncAddressesToCheckout();
        }
    } else {
        const addressId = parseInt(selectedAddress.value);
        const address = userData.addresses.find(addr => addr.id === addressId);
        if (address) {
            addressData = {
                name: address.fullName || address.name,
                phone: address.phone,
                address: address.street,
                city: address.city,
                pincode: address.pincode,
                state: address.state
            };
        }
    }

// Replace with default delivery option (no user selection needed)
const deliveryText = '';

    const paymentMethod = document.querySelector('input[name="payment"]:checked');
    if (!paymentMethod) {
        console.error('No payment method selected');
        alert('Please select a payment method');
        isProcessingOrder = false;
        return;
    }
    
    const paymentText = {
        'card': 'Credit/Debit Card',
        'upi': 'UPI Payment',
        'cod': 'Cash on Delivery'
    }[paymentMethod.value] || 'Unknown';

    // IMPORTANT FIX: Use the existing order ID if it exists, otherwise generate a new one
    // This ensures the order ID matches what was shown in the QR code
    if (!currentOrderId) {
        currentOrderId = 'OM' + Date.now().toString().slice(-6);
    }
    
    const orderId = currentOrderId;
    console.log('Using order ID for order creation:', orderId);

    const orderDate = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
    const orderTime = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const totals = calculateCartTotals();
    
    const orderItems = userData.cart.map(cartItem => ({
        id: cartItem.id,
        name: cartItem.name,
        quantity: cartItem.quantity,
        price: cartItem.price,
        weight: cartItem.weight,
        image: cartItem.image,
        originalPrice: cartItem.originalPrice,
        discount: cartItem.discount,
        category: cartItem.category
    }));
    
    const order = {
        id: orderId,  // Use the same order ID that was shown in QR
        date: orderDate,
        time: orderTime,
        items: orderItems,
        total: totals.total,
        subtotal: totals.subtotal,
        delivery: totals.delivery,
        tax: totals.tax,
        couponDiscount: totals.couponDiscount,
        status: 'confirmed',
        address: addressData,
        payment: paymentText,
        deliveryOption: deliveryText,
        couponUsed: activeCoupon ? activeCoupon.code : null
    };
    
    console.log('Order created with ID:', orderId, order);
    
    // Save order to user data
    if (!userData.orders) {
        userData.orders = [];
    }
    userData.orders.push(order);
    
    // Save the current order for confirmation page
    localStorage.setItem('currentOrder', JSON.stringify(order));
    
    // Clear cart and coupon
    userData.cart = [];
    activeCoupon = null;
    saveUserData();
    updateCartCount();
    
    // Show the confirmation step within checkout page
    showOrderConfirmation(order);
    
    showToastMessage('Order placed successfully!');
    console.log('Order completed successfully');
    
    // Reset the processing flag after a short delay
    setTimeout(() => {
        isProcessingOrder = false;
    }, 1000);
    
    // Don't reset currentOrderId immediately - keep it for the confirmation page
    // It will be reset when starting a new checkout session
}
    // Also update the navigateToStep function to ensure order ID consistency
    function navigateToStep(step) {
        console.log('Navigating to step:', step);
        
        if (step === 'payment') {
            if (!validateCurrentAddress()) {
                showError('address-error', 'Please select or enter a valid address');
                return;
            }
            // IMPORTANT FIX: Generate order ID when entering payment step
            // This ensures the QR code and payment use the same ID
            ensureOrderId();
            
            // Update all order ID displays
            displayOrderId(currentOrderId);
            
            // If UPI is selected, regenerate QR with the correct order ID
            const upiPaymentRadio = document.getElementById('upi-payment');
            if (upiPaymentRadio && upiPaymentRadio.checked) {
                // Small delay to ensure DOM is ready
                setTimeout(() => {
                    if (!isQRGenerated) {
                        initializeUPIPayment();
                    } else {
                        // Regenerate QR with correct order ID
                        generateQRCode();
                    }
                }, 100);
            }
        }
        
        if (step === 'confirmation') {
            // Process order before showing confirmation
            processOrder();
            return;
        }
        
        const checkoutSteps = document.querySelectorAll('.checkout-step');
        checkoutSteps.forEach(stepElement => {
            stepElement.classList.remove('active');
        });
        
        const currentStepElement = document.getElementById(`${step}-step`);
        if (currentStepElement) {
            currentStepElement.classList.add('active');
            updateStepIndicators(step);
            currentStepElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // Update initializeUPIPayment to ensure order ID is set
    function initializeUPIPayment() {
        updateOrderAmounts();
        
        // Ensure order ID exists before generating QR
        ensureOrderId();
        
        generateQRCode();
        startTimer();
        updateGenerationTime();
        
        isQRGenerated = true;
        qrExpired = false;
        
        const qrOverlay = document.getElementById('qr-overlay');
        if (qrOverlay) {
            qrOverlay.style.display = 'none';
        }
        
        const qrCodeElement = document.querySelector('.qr-code');
        if (qrCodeElement) {
            qrCodeElement.style.opacity = '1';
            qrCodeElement.style.pointerEvents = 'auto';
        }
    }

    // Add this function to reset order ID when starting a new checkout
    function resetOrderId() {
        currentOrderId = null;
        customerCoordinates = null;
        deliveryCharge = 0;
    }

    function showPage(pageName) {
        console.log('Showing page:', pageName);
        
        // Hide all main pages
        Object.keys(pages).forEach(key => {
            if (pages[key]) {
                pages[key].style.display = 'none';
                pages[key].classList.remove('active');
            }
        });
        
        // Hide all info pages
        document.querySelectorAll('.info-page').forEach(page => {
            page.style.display = 'none';
        });
        
        // Show selected page
        if (pages[pageName]) {
            pages[pageName].style.display = pageName === 'login' || pageName === 'signup' ? 'flex' : 'block';
            pages[pageName].classList.add('active');
            
            // Reset order ID when leaving checkout page (except when going to confirmation)
            if (pageName !== 'checkout' && pageName !== 'confirmation') {
                resetOrderId();
            }
            
            window.scrollTo(0, 0);
            
            initializePageContent(pageName);
            
            console.log(`Page ${pageName} shown successfully`);
        } else {
            console.error(`Page ${pageName} not found`);
        }
    }

    // ===== NEW FUNCTION TO SHOW ORDER CONFIRMATION =====
    function showOrderConfirmation(order) {
        console.log('Showing order confirmation with order:', order);
        
        // Hide all checkout steps
        document.querySelectorAll('.checkout-step').forEach(step => {
            step.classList.remove('active');
        });
        
        // Show the confirmation step
        const confirmationStep = document.getElementById('confirmation-step');
        if (confirmationStep) {
            confirmationStep.classList.add('active');
            
            // Update confirmation page with order details
            updateConfirmationDetails(order);
            
            // Update step indicators
            updateStepIndicators('confirmation');
            
            // Scroll to top
            window.scrollTo(0, 0);
        } else {
            console.error('Confirmation step element not found');
        }
    }

// ===== UPDATED FUNCTION TO UPDATE CONFIRMATION DETAILS =====
function updateConfirmationDetails(order) {
    if (!order) return;
    
    console.log('Updating confirmation details with order:', order);

    // debug: confirm order id values
    console.log('updateConfirmationDetails - order.id =', order.id, ' currentOrderId =', currentOrderId);
    
    // Find all possible order ID elements
    const orderIdElement = document.getElementById('order-id');
    const orderIdElements = document.querySelectorAll('[id*="order-id"], [class*="order-id"]');
    
    // Determine definitive order ID: prefer order.id, then any currentOrderId, then generate
    const randomOrderId = order.id || currentOrderId || ('OM' + Math.floor(100000 + Math.random() * 900000).toString());
    // sync shared id
    currentOrderId = randomOrderId;
    console.log('Setting order ID to:', randomOrderId);

    // update all order id displays
    if (typeof displayOrderId === 'function') {
        displayOrderId(randomOrderId);
    }
    
    // Update specific element by ID
    if (orderIdElement) {
        orderIdElement.textContent = randomOrderId;
        console.log('Updated #order-id element');
    }
    
    // Update any element containing order-id in class or id
    orderIdElements.forEach(el => {
        if (el !== orderIdElement) {
            el.textContent = randomOrderId;
        }
    });
    
    // Also look for spans that might contain the placeholder
    document.querySelectorAll('.order-info span, .confirmation-details span, .order-summary span').forEach(el => {
        if (el.textContent.includes('OM123456') || el.textContent.includes('Order #') || el.textContent.match(/OM\d{6}/)) {
            el.textContent = randomOrderId;
            console.log('Updated element with placeholder:', el);
        }
    });
    
    // ===== FIXED: Update Order Date - Using correct ID =====
    const orderDateElement = document.getElementById('order-date-display'); // Changed from 'order-date' to 'order-date-display'
    if (orderDateElement) {
        // Get current date/time as fallback
        const now = new Date();
        const formattedDateTime = now.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }) + ' at ' + now.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        
        // Set the date
        orderDateElement.textContent = formattedDateTime;
        console.log('Updated order date to:', formattedDateTime);
    } else {
        console.log('Order date element not found with ID: order-date-display');
    }
    
    // Update Shipping Details
    const shippingDetails = document.getElementById('shipping-details');
    if (shippingDetails && order.address) {
        shippingDetails.innerHTML = `
            <div class="shipping-info">
                <p><strong>${order.address.name || 'Customer'}</strong></p>
                <p>${order.address.address || order.address.street || ''}</p>
                <p>${order.address.city || ''}, ${order.address.state || ''} - ${order.address.pincode || ''}</p>
                <p>Phone: ${order.address.phone || ''}</p>
                
            </div>
        `;
    }
    
    // Update Payment Details
    const paymentDetails = document.getElementById('payment-details');
    if (paymentDetails) {
        const paymentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        paymentDetails.innerHTML = `
            <div class="payment-info">
                <p><strong>Payment Method:</strong> ${order.payment || 'Not specified'}</p>
                <p><strong>Payment Date:</strong> ${paymentDate}</p>
                <p><strong>Payment Status:</strong> <span class="status-success">✓ Completed</span></p>
            </div>
        `;
    }
    
    // Update Order Items
    const confirmationItems = document.querySelector('.confirmation-items');
    if (confirmationItems && order.items && order.items.length > 0) {
        confirmationItems.innerHTML = '';
        
        order.items.forEach(item => {
            const totalPrice = item.price * item.quantity;
            const displayName = `${item.name} ${item.weight ? '(' + item.weight + ')' : ''} × ${item.quantity}`;
            
            const itemElement = document.createElement('div');
            itemElement.className = 'confirmation-item';
            itemElement.innerHTML = `
                <img src="${item.image || 'https://via.placeholder.com/60x60/cccccc/666666?text=📦'}" alt="${item.name}" class="item-image" 
                     onerror="this.src='https://via.placeholder.com/60x60/cccccc/666666?text=📦'">
                <div class="item-info">
                    <span class="item-name">${displayName}</span>
                    <span class="item-price">₹${totalPrice.toFixed(2)}</span>
                </div>
            `;
            confirmationItems.appendChild(itemElement);
        });
    }
    
    // Update Order Totals
    const confirmationTotals = document.querySelector('.confirmation-totals');
    if (confirmationTotals) {
        confirmationTotals.innerHTML = `
            <h2 class="order-summary-heading">🛒 Order Summary</h2>
            <div class="total-row">
                <span>Subtotal</span>
                <span>₹${(order.subtotal || 0).toFixed(2)}</span>
            </div>
            <div class="total-row">
                <span>Shipping</span>
                <span>₹${(order.delivery || 0).toFixed(2)}</span>
            </div>
            <div class="total-row">
                <span>Tax</span>
                <span>₹${(order.tax || 0).toFixed(2)}</span>
            </div>
            ${(order.couponDiscount || 0) > 0 ? `
            <div class="total-row discount">
                <span>Discount</span>
                <span>-₹${(order.couponDiscount || 0).toFixed(2)}</span>
            </div>
            ` : ''}
            <div class="total-row grand-total">
                <span>Total</span>
                <span>₹${(order.total || 0).toFixed(2)}</span>
            </div>
        `;
    }
    
    // Force a re-check after a short delay
    setTimeout(() => {
        const orderIdSpan = document.getElementById('order-id');
        if (orderIdSpan && orderIdSpan.textContent === 'OM123456') {
            orderIdSpan.textContent = randomOrderId;
            console.log('Force updated order ID after delay');
        }
        
        // Double-check order date
        const dateSpan = document.getElementById('order-date-display');
        if (dateSpan && !dateSpan.textContent) {
            const now = new Date();
            dateSpan.textContent = now.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }) + ' at ' + now.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            console.log('Force updated order date after delay');
        }
    }, 100);
    
    // Set up the action buttons for confirmation page
    if (typeof setupConfirmationButtons === 'function') {
        setupConfirmationButtons();
    }
}
// ===== SETUP CONFIRMATION PAGE BUTTONS =====
function setupConfirmationButtons() {
    // Look for the actual button IDs in your HTML
    const showOrdersBtn = document.getElementById('show-orders-btn');
    const continueShoppingBtn = document.getElementById('continue-shopping-btn');
    
    console.log('Setting up confirmation buttons:', {
        showOrdersBtn: !!showOrdersBtn,
        continueShoppingBtn: !!continueShoppingBtn
    });
    
    if (showOrdersBtn) {
        // Remove any existing listeners by cloning
        const newShowOrdersBtn = showOrdersBtn.cloneNode(true);
        showOrdersBtn.parentNode.replaceChild(newShowOrdersBtn, showOrdersBtn);
        
        newShowOrdersBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Show Your Orders button clicked');
            
            // Navigate to profile orders tab
            showPage('profile');
            
            setTimeout(() => {
                const ordersTab = document.querySelector('.profile-nav-item[data-tab="orders"]');
                if (ordersTab) {
                    ordersTab.click();
                    
                    // Scroll to orders section
                    const ordersSection = document.getElementById('orders');
                    if (ordersSection) {
                        ordersSection.scrollIntoView({ behavior: 'smooth' });
                    }
                }
            }, 100);
            
            showToastMessage('Viewing your orders');
        });
    } else {
        console.warn('Show Your Orders button not found');
    }
    
    if (continueShoppingBtn) {
        // Remove any existing listeners by cloning
        const newContinueBtn = continueShoppingBtn.cloneNode(true);
        continueShoppingBtn.parentNode.replaceChild(newContinueBtn, continueShoppingBtn);
        
        newContinueBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Continue Shopping button clicked');
            
            // Navigate to products page
            showPage('products');
            showToastMessage('Thank you for your order!');
        });
    } else {
        console.warn('Continue Shopping button not found');
    }
}
    // ===== QUICK VIEW FUNCTIONALITY =====
    function showQuickView(productId) {
        const product = productDatabase[productId];
        if (!product) return;
        
        const modal = document.getElementById('quick-view-modal');
        if (!modal) return;
        
        const quickViewImage = modal.querySelector('.quick-view-image');
        const quickViewTitle = modal.querySelector('.quick-view-title');
        const quickViewCategory = modal.querySelector('.quick-view-category');
        const quickViewDescription = modal.querySelector('.quick-view-description');
        const quickViewRating = modal.querySelector('.quick-view-rating');
        const quickViewReviews = modal.querySelector('.quick-view-reviews');
        
        if (quickViewImage) quickViewImage.src = product.image;
        if (quickViewImage) quickViewImage.alt = product.name;
        if (quickViewTitle) quickViewTitle.textContent = product.name;
        if (quickViewCategory) quickViewCategory.textContent = product.category;
        if (quickViewDescription) quickViewDescription.textContent = product.description || 'No description available.';
        if (quickViewRating) quickViewRating.textContent = `★ ${product.rating || '4.0'}`;
        if (quickViewReviews) quickViewReviews.textContent = `(${product.reviews || 0} reviews)`;
        
        const currentPrice = modal.querySelector('.quick-view-current-price');
        const originalPrice = modal.querySelector('.quick-view-original-price');
        const discount = modal.querySelector('.quick-view-discount');
        
        if (currentPrice) currentPrice.textContent = `₹${product.prices[1]}`;
        if (originalPrice) originalPrice.textContent = `₹${product.originalPrice}`;
        if (discount) discount.textContent = `${product.discount}% off`;
        
        const stockStatus = modal.querySelector('.quick-view-stock');
        if (stockStatus) {
            if (product.stock > 10) {
                stockStatus.textContent = 'In Stock';
                stockStatus.className = 'quick-view-stock in-stock';
            } else if (product.stock > 0) {
                stockStatus.textContent = `Only ${product.stock} left`;
                stockStatus.className = 'quick-view-stock low-stock';
            } else {
                stockStatus.textContent = 'Out of Stock';
                stockStatus.className = 'quick-view-stock out-of-stock';
            }
        }
        
        const quantitySelect = modal.querySelector('.quick-view-quantity');
        if (quantitySelect) {
            quantitySelect.innerHTML = '';
            for (const [key, weight] of Object.entries(product.weight)) {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = `${weight} - ₹${product.prices[key]}`;
                quantitySelect.appendChild(option);
            }
        }
        
        const addToCartBtn = modal.querySelector('.add-to-cart-quick');
        if (addToCartBtn) {
            addToCartBtn.setAttribute('data-product-id', productId);
            addToCartBtn.addEventListener('click', function() {
                const selectedQuantity = parseInt(quantitySelect.value);
                addToCart(productId, selectedQuantity);
                hideQuickView();
            });
        }
        
        modal.style.display = 'flex';
    }

    function hideQuickView() {
        const modal = document.getElementById('quick-view-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // ===== MODAL FUNCTIONALITY =====
    function setupModalEvents() {
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('modal-close') || e.target.classList.contains('modal-cancel')) {
                const modal = e.target.closest('.modal');
                if (modal) {
                    modal.style.display = 'none';
                    e.stopPropagation();
                }
            }
            
            if (e.target.classList.contains('quick-view-close')) {
                hideQuickView();
            }
            
            if (e.target.classList.contains('modal')) {
                if (!e.target.classList.contains('no-close-outside')) {
                    e.target.style.display = 'none';
                }
            }
        });
        
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('close-payment-modal')) {
                const modal = document.getElementById('payment-modal');
                if (modal) {
                    modal.style.display = 'none';
                }
            }
        });
    }
  // ===== REVIEWS SECTION FUNCTIONALITY - INLINE EDIT/DELETE VERSION =====

// Use a flag to prevent multiple initializations
let reviewsInitialized = false;
let currentlyEditingId = null;
let currentlyDeletingId = null;

function initReviewsSection() {
    // Prevent multiple initializations
    if (reviewsInitialized) {
        console.log('Reviews already initialized, skipping...');
        return;
    }
    
    console.log('Initializing reviews section...');
    
    // Set up event delegation once
    setupReviewEventDelegation();
    
    // Initialize form elements - use debounced events
    initializeReviewForms();
    
    // Initial render
    renderReviews();
    updateReviewStats();
    
    reviewsInitialized = true;
    console.log('Reviews initialized successfully');
}

// Separate form initialization
function initializeReviewForms() {
    // Write review form
    const writeReviewBtn = document.getElementById('write-review-btn');
    const writeFirstReviewBtn = document.getElementById('write-first-review');
    const closeReviewBtn = document.querySelector('.btn-close-review');
    const cancelReviewBtn = document.querySelector('.cancel-review');
    const reviewForm = document.getElementById('review-form');
    const reviewContent = document.getElementById('review-content');
    
    if (writeReviewBtn) {
        writeReviewBtn.addEventListener('click', showWriteReviewForm);
    }
    
    if (writeFirstReviewBtn) {
        writeFirstReviewBtn.addEventListener('click', showWriteReviewForm);
    }
    
    if (closeReviewBtn) {
        closeReviewBtn.addEventListener('click', hideWriteReviewForm);
    }
    
    if (cancelReviewBtn) {
        cancelReviewBtn.addEventListener('click', hideWriteReviewForm);
    }
    
    if (reviewForm) {
        reviewForm.addEventListener('submit', handleReviewSubmit);
    }
    
    // Use debounced input handlers for better performance
    if (reviewContent) {
        reviewContent.addEventListener('input', debounce(updateCharCount, 100));
    }
    
    // Initial updates
    updateCharCount();
}

// Set up event delegation for dynamic review buttons
function setupReviewEventDelegation() {
    const reviewsList = document.querySelector('.reviews-list');
    if (!reviewsList) return;
    
    // Use a single event listener for all review actions
    reviewsList.addEventListener('click', handleReviewActions);
}

// Handle all review actions via event delegation
function handleReviewActions(event) {
    const target = event.target;
    
    // Handle Edit button click
    if (target.classList.contains('btn-edit-review') || target.closest('.btn-edit-review')) {
        event.preventDefault();
        event.stopPropagation();
        
        const editBtn = target.classList.contains('btn-edit-review') ? target : target.closest('.btn-edit-review');
        const reviewItem = editBtn.closest('.review-item');
        
        if (reviewItem) {
            const reviewId = parseInt(reviewItem.dataset.reviewId);
            openInlineEditForm(reviewId);
        }
    }
    
    // Handle Delete button click
    if (target.classList.contains('btn-delete-review') || target.closest('.btn-delete-review')) {
        event.preventDefault();
        event.stopPropagation();
        
        const deleteBtn = target.classList.contains('btn-delete-review') ? target : target.closest('.btn-delete-review');
        const reviewItem = deleteBtn.closest('.review-item');
        
        if (reviewItem) {
            const reviewId = parseInt(reviewItem.dataset.reviewId);
            openInlineDeleteConfirm(reviewId);
        }
    }
    
    // Handle Cancel Edit button
    if (target.classList.contains('cancel-edit') || target.closest('.cancel-edit')) {
        event.preventDefault();
        cancelInlineEdit();
    }
    
    // Handle Save Edit button
    if (target.classList.contains('save-edit') || target.closest('.save-edit')) {
        event.preventDefault();
        saveInlineEdit();
    }
    
    // Handle Cancel Delete button
    if (target.classList.contains('cancel-delete') || target.closest('.cancel-delete')) {
        event.preventDefault();
        cancelInlineDelete();
    }
    
    // Handle Confirm Delete button
    if (target.classList.contains('confirm-delete') || target.closest('.confirm-delete')) {
        event.preventDefault();
        confirmInlineDelete();
    }
}

// Open inline edit form
function openInlineEditForm(reviewId) {
    const review = userReviews.find(r => r.id === reviewId);
    if (!review) return;
    
    // Cancel any ongoing edit/delete
    cancelInlineEdit();
    cancelInlineDelete();
    
    currentlyEditingId = reviewId;
    
    const reviewItem = document.querySelector(`.review-item[data-review-id="${reviewId}"]`);
    if (!reviewItem) return;
    
    // Hide the original content and show edit form
    const reviewContent = reviewItem.querySelector('.review-content');
    const reviewActions = reviewItem.querySelector('.review-actions');
    
    // Create edit form if it doesn't exist
    let editForm = reviewItem.querySelector('.inline-edit-form');
    if (!editForm) {
        editForm = createInlineEditForm(review);
        reviewItem.appendChild(editForm);
    }
    
    // Toggle visibility
    if (reviewContent) reviewContent.style.display = 'none';
    if (reviewActions) reviewActions.style.display = 'none';
    editForm.style.display = 'block';
}

// Create inline edit form
function createInlineEditForm(review) {
    const editForm = document.createElement('div');
    editForm.className = 'inline-edit-form';
    editForm.innerHTML = `
        <div class="edit-form-content">
            <h4>Edit Review</h4>
            
            <div class="rating-input">
                <label>Rating:</label>
                <div class="star-rating">
                    ${[5,4,3,2,1].map(num => `
                        <input type="radio" name="edit-rating-${review.id}" id="edit-star${num}-${review.id}" value="${num}" ${review.rating === num ? 'checked' : ''}>
                        <label for="edit-star${num}-${review.id}" class="star-label"><i class="fas fa-star"></i></label>
                    `).join('')}
                </div>
            </div>
            
            <div class="form-group">
                <label for="edit-title-${review.id}">Review Title (Optional)</label>
                <input type="text" id="edit-title-${review.id}" class="edit-review-title" placeholder="Summarize your review" value="${escapeHtml(review.title || '')}">
            </div>
            
            <div class="form-group">
                <label for="edit-content-${review.id}">Review Details</label>
                <textarea id="edit-content-${review.id}" class="edit-review-content" placeholder="Share your experience with this product..." minlength="50" maxlength="500" required>${escapeHtml(review.content || '')}</textarea>
                <div class="char-counter">
                    <span class="edit-char-count-${review.id}">${(review.content || '').length}</span>/500
                </div>
            </div>
            
            <div class="form-group checkbox">
                <input type="checkbox" id="edit-recommend-${review.id}" class="edit-recommend-product" ${review.recommend ? 'checked' : ''}>
                <label for="edit-recommend-${review.id}">I recommend this product</label>
            </div>
            
            <div class="edit-form-actions">
                <button type="button" class="btn-primary save-edit">Save Changes</button>
                <button type="button" class="btn-outline cancel-edit">Cancel</button>
            </div>
        </div>
    `;
    
    // Add input event listener for char count
    const textarea = editForm.querySelector(`#edit-content-${review.id}`);
    const charCountSpan = editForm.querySelector(`.edit-char-count-${review.id}`);
    
    if (textarea && charCountSpan) {
        textarea.addEventListener('input', function() {
            const count = this.value.length;
            charCountSpan.textContent = count;
            charCountSpan.style.color = count < 50 || count > 500 ? '#f44336' : '#4CAF50';
        });
    }
    
    return editForm;
}

// Save inline edit
function saveInlineEdit() {
    if (!currentlyEditingId) return;
    
    const reviewItem = document.querySelector(`.review-item[data-review-id="${currentlyEditingId}"]`);
    if (!reviewItem) return;
    
    const editForm = reviewItem.querySelector('.inline-edit-form');
    const rating = editForm.querySelector(`input[name="edit-rating-${currentlyEditingId}"]:checked`)?.value;
    const title = editForm.querySelector(`#edit-title-${currentlyEditingId}`).value;
    const content = editForm.querySelector(`#edit-content-${currentlyEditingId}`).value;
    const recommend = editForm.querySelector(`#edit-recommend-${currentlyEditingId}`).checked;
    
    if (!rating) {
        alert('Please provide a rating');
        return;
    }
    
    if (content.length < 50 || content.length > 500) {
        alert(content.length < 50 ? 'Minimum 50 characters required' : 'Maximum 500 characters allowed');
        return;
    }
    
    const reviewIndex = userReviews.findIndex(r => r.id === currentlyEditingId);
    if (reviewIndex !== -1) {
        userReviews[reviewIndex] = {
            ...userReviews[reviewIndex],
            rating: parseInt(rating),
            title: title,
            content: content,
            recommend: recommend,
            reviewDate: 'Just now (edited)'
        };
        
        // Batch render updates
        requestAnimationFrame(() => {
            // Instead of re-rendering everything, update just this review item
            updateReviewItem(reviewItem, userReviews[reviewIndex]);
            updateReviewStats();
        });
        
        showNotification('Review updated successfully!', 'success');
        cancelInlineEdit();
    }
}

// Cancel inline edit
function cancelInlineEdit() {
    if (!currentlyEditingId) return;
    
    const reviewItem = document.querySelector(`.review-item[data-review-id="${currentlyEditingId}"]`);
    if (reviewItem) {
        const reviewContent = reviewItem.querySelector('.review-content');
        const reviewActions = reviewItem.querySelector('.review-actions');
        const editForm = reviewItem.querySelector('.inline-edit-form');
        
        if (reviewContent) reviewContent.style.display = 'block';
        if (reviewActions) reviewActions.style.display = 'flex';
        if (editForm) editForm.style.display = 'none';
    }
    
    currentlyEditingId = null;
}

// Open inline delete confirmation
function openInlineDeleteConfirm(reviewId) {
    const review = userReviews.find(r => r.id === reviewId);
    if (!review) return;
    
    // Cancel any ongoing edit/delete
    cancelInlineEdit();
    cancelInlineDelete();
    
    currentlyDeletingId = reviewId;
    
    const reviewItem = document.querySelector(`.review-item[data-review-id="${reviewId}"]`);
    if (!reviewItem) return;
    
    // Hide the original content and show delete confirmation
    const reviewContent = reviewItem.querySelector('.review-content');
    const reviewActions = reviewItem.querySelector('.review-actions');
    
    // Create delete confirmation if it doesn't exist
    let deleteConfirm = reviewItem.querySelector('.inline-delete-confirm');
    if (!deleteConfirm) {
        deleteConfirm = createInlineDeleteConfirm(review);
        reviewItem.appendChild(deleteConfirm);
    }
    
    // Toggle visibility
    if (reviewContent) reviewContent.style.display = 'none';
    if (reviewActions) reviewActions.style.display = 'none';
    deleteConfirm.style.display = 'block';
}

// Create inline delete confirmation
function createInlineDeleteConfirm(review) {
    const deleteConfirm = document.createElement('div');
    deleteConfirm.className = 'inline-delete-confirm';
    deleteConfirm.innerHTML = `
        <div class="delete-confirm-content">
            <i class="fas fa-exclamation-triangle" style="color: #f44336; font-size: 2rem; margin-bottom: 1rem;"></i>
            <h4>Delete Review?</h4>
            <p>Are you sure you want to delete your review for "${escapeHtml(review.productName)}"?</p>
            <p class="warning-text">This action cannot be undone.</p>
            <div class="delete-confirm-actions">
                <button type="button" class="btn-primary confirm-delete">Yes, Delete</button>
                <button type="button" class="btn-outline cancel-delete">Cancel</button>
            </div>
        </div>
    `;
    
    return deleteConfirm;
}

// Confirm inline delete
function confirmInlineDelete() {
    if (!currentlyDeletingId) return;
    
    const index = userReviews.findIndex(r => r.id === currentlyDeletingId);
    if (index !== -1) {
        userReviews.splice(index, 1);
        
        // Batch render updates
        requestAnimationFrame(() => {
            renderReviews();
            updateReviewStats();
        });
        
        showNotification('Review deleted successfully!', 'success');
    }
    
    currentlyDeletingId = null;
}

// Cancel inline delete
function cancelInlineDelete() {
    if (!currentlyDeletingId) return;
    
    const reviewItem = document.querySelector(`.review-item[data-review-id="${currentlyDeletingId}"]`);
    if (reviewItem) {
        const reviewContent = reviewItem.querySelector('.review-content');
        const reviewActions = reviewItem.querySelector('.review-actions');
        const deleteConfirm = reviewItem.querySelector('.inline-delete-confirm');
        
        if (reviewContent) reviewContent.style.display = 'block';
        if (reviewActions) reviewActions.style.display = 'flex';
        if (deleteConfirm) deleteConfirm.style.display = 'none';
    }
    
    currentlyDeletingId = null;
}

// Update a single review item instead of re-rendering all
function updateReviewItem(reviewItem, review) {
    const starsHtml = generateStarsHtml(review.rating);
    const recommendIcon = review.recommend ? 'check' : 'times';
    const recommendText = review.recommend ? 'Recommends' : 'Doesn\'t recommend';
    
    const reviewContent = reviewItem.querySelector('.review-content');
    if (reviewContent) {
        reviewContent.innerHTML = `
            <h5>${escapeHtml(review.title)}</h5>
            <p>${escapeHtml(review.content)}</p>
            <div class="review-recommend">
                <i class="fas fa-${recommendIcon}-circle"></i>
                <span>${recommendText} this product</span>
            </div>
        `;
    }
    
    const reviewHeader = reviewItem.querySelector('.review-header .review-rating');
    if (reviewHeader) {
        reviewHeader.innerHTML = `
            <div class="stars">${starsHtml}</div>
            <span class="review-date">${escapeHtml(review.reviewDate)}</span>
        `;
    }
    
    // Hide any open forms
    const editForm = reviewItem.querySelector('.inline-edit-form');
    const deleteConfirm = reviewItem.querySelector('.inline-delete-confirm');
    if (editForm) editForm.style.display = 'none';
    if (deleteConfirm) deleteConfirm.style.display = 'none';
}

// Optimized render function
function renderReviews() {
    const reviewsList = document.querySelector('.reviews-list');
    if (!reviewsList) return;
    
    const noReviewsState = document.getElementById('no-reviews-state');
    
    // Use document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Clear existing reviews (but keep the container)
    while (reviewsList.firstChild) {
        reviewsList.removeChild(reviewsList.firstChild);
    }
    
    if (!userReviews || userReviews.length === 0) {
        if (noReviewsState) {
            noReviewsState.style.display = 'block';
            reviewsList.appendChild(noReviewsState);
        }
        return;
    }
    
    if (noReviewsState) noReviewsState.style.display = 'none';
    
    // Create all review elements
    userReviews.forEach(review => {
        fragment.appendChild(createReviewElement(review));
    });
    
    // Add all at once
    reviewsList.appendChild(fragment);
}

function createReviewElement(review) {
    const reviewItem = document.createElement('div');
    reviewItem.className = 'review-item';
    reviewItem.dataset.reviewId = review.id;
    
    const starsHtml = generateStarsHtml(review.rating);
    const recommendIcon = review.recommend ? 'check' : 'times';
    const recommendText = review.recommend ? 'Recommends' : 'Doesn\'t recommend';
    
    reviewItem.innerHTML = `
        <div class="review-header">
            <div class="review-product">
                <img src="${review.productImage || 'https://via.placeholder.com/60x60'}" alt="${review.productName}" loading="lazy">
                <div class="product-info">
                    <h4>${escapeHtml(review.productName)}</h4>
                    <p>Purchased on: ${escapeHtml(review.purchaseDate)}</p>
                </div>
            </div>
            <div class="review-rating">
                <div class="stars">${starsHtml}</div>
                <span class="review-date">${escapeHtml(review.reviewDate)}</span>
            </div>
        </div>
        <div class="review-content">
            <h5>${escapeHtml(review.title)}</h5>
            <p>${escapeHtml(review.content)}</p>
            <div class="review-recommend">
                <i class="fas fa-${recommendIcon}-circle"></i>
                <span>${recommendText} this product</span>
            </div>
        </div>
        <div class="review-actions">
            <button class="btn-outline btn-edit-review"><i class="fas fa-edit"></i> Edit</button>
            <button class="btn-outline btn-delete-review"><i class="fas fa-trash"></i> Delete</button>
        </div>
    `;
    
    return reviewItem;
}

// Helper function to prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function updateReviewStats() {
    if (!userReviews || userReviews.length === 0) {
        updateElementText('.rating-average', '0.0');
        updateElementText('.total-reviews', '0 reviews');
        updateElementHTML('.rating-progress', '');
        return;
    }
    
    const totalReviews = userReviews.length;
    const averageRating = (userReviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews).toFixed(1);
    
    updateElementText('.rating-average', averageRating);
    updateElementText('.total-reviews', `${totalReviews} ${totalReviews === 1 ? 'review' : 'reviews'}`);
    
    // Update rating distribution
    const ratingCounts = {5:0, 4:0, 3:0, 2:0, 1:0};
    userReviews.forEach(review => {
        const rating = Math.floor(review.rating);
        if (ratingCounts.hasOwnProperty(rating)) ratingCounts[rating]++;
    });
    
    let progressHtml = '';
    for (let i = 5; i >= 1; i--) {
        const count = ratingCounts[i];
        const percentage = (count / totalReviews * 100).toFixed(1);
        progressHtml += `
            <div class="rating-bar">
                <span class="rating-label">${i} star</span>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage}%"></div>
                </div>
                <span class="rating-count">${count}</span>
            </div>
        `;
    }
    
    updateElementHTML('.rating-progress', progressHtml);
}

// Helper functions for DOM updates
function updateElementText(selector, text) {
    const element = document.querySelector(selector);
    if (element) element.textContent = text;
}

function updateElementHTML(selector, html) {
    const element = document.querySelector(selector);
    if (element) element.innerHTML = html;
}

function showWriteReviewForm() {
    toggleReviewForms(true);
}

function hideWriteReviewForm() {
    toggleReviewForms(false);
    document.getElementById('review-form')?.reset();
    updateCharCount();
}

function toggleReviewForms(showWriteForm) {
    const writeSection = document.querySelector('.write-review-section');
    const listSection = document.querySelector('.reviews-list-section');
    
    if (writeSection) writeSection.style.display = showWriteForm ? 'block' : 'none';
    if (listSection) listSection.style.display = showWriteForm ? 'none' : 'block';
}

function handleReviewSubmit(e) {
    e.preventDefault();
    
    const rating = document.querySelector('input[name="rating"]:checked')?.value;
    const title = document.getElementById('review-title').value;
    const content = document.getElementById('review-content').value;
    const recommend = document.getElementById('recommend-product').checked;
    
    if (!rating) {
        alert('Please provide a rating');
        return;
    }
    
    if (content.length < 50 || content.length > 500) {
        alert(content.length < 50 ? 'Minimum 50 characters required' : 'Maximum 500 characters allowed');
        return;
    }
    
    const newReview = {
        id: Date.now(),
        productId: 1,
        productName: 'Organic Shimla Apples',
        productImage: 'https://w0.peakpx.com/wallpaper/182/615/HD-wallpaper-fruits-apple-fruit.jpg',
        rating: parseInt(rating),
        title: title,
        content: content,
        recommend: recommend,
        purchaseDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        reviewDate: 'Just now'
    };
    
    userReviews.unshift(newReview);
    
    // Batch updates
    requestAnimationFrame(() => {
        renderReviews();
        updateReviewStats();
    });
    
    hideWriteReviewForm();
    showNotification('Review posted successfully!', 'success');
}

// Debounced input handlers
function updateCharCount() {
    const reviewContent = document.getElementById('review-content');
    const charCount = document.getElementById('char-count');
    if (!reviewContent || !charCount) return;
    
    const count = reviewContent.value.length;
    charCount.textContent = count;
    charCount.style.color = count < 50 || count > 500 ? '#f44336' : '#4CAF50';
}

function generateStarsHtml(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    let starsHtml = '';
    
    for (let i = 1; i <= 5; i++) {
        if (i <= fullStars) {
            starsHtml += '<i class="fas fa-star"></i>';
        } else if (hasHalfStar && i === fullStars + 1) {
            starsHtml += '<i class="fas fa-star-half-alt"></i>';
        } else {
            starsHtml += '<i class="far fa-star"></i>';
        }
    }
    
    return starsHtml;
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

// Optimized page activation detection
document.addEventListener('DOMContentLoaded', function() {
    let profilePage = document.getElementById('profile-page');
    
    if (!profilePage) return;
    
    // Check if already active
    if (profilePage.classList.contains('active')) {
        setTimeout(initReviewsSection, 100);
    }
    
    // Use a single observer with throttled callback
    let timeout;
    const observer = new MutationObserver(function() {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            if (profilePage.classList.contains('active')) {
                console.log('Profile page activated');
                initReviewsSection();
            }
        }, 200);
    });
    
    observer.observe(profilePage, { 
        attributes: true, 
        attributeFilter: ['class'],
        attributeOldValue: false
    });
});
    // ===== FEEDBACK SYSTEM FUNCTIONALITY =====
    function setupFeedbackEvents() {
        if (marqueeBtn) {
            marqueeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                openFeedbackModal();
            });
        }

        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', closeFeedbackModal);
        }

        if (feedbackModal) {
            feedbackModal.addEventListener('click', function(e) {
                if (e.target === feedbackModal) {
                    closeFeedbackModal();
                }
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && feedbackModal && feedbackModal.style.display === 'block') {
                closeFeedbackModal();
            }
        });

        if (messageTextarea && charCount) {
            messageTextarea.addEventListener('input', function() {
                const length = this.value.length;
                charCount.textContent = `${length}/500 characters`;
                
                if (length > 450) {
                    charCount.style.color = '#ff9800';
                } else if (length > 480) {
                    charCount.style.color = '#f44336';
                } else {
                    charCount.style.color = '#666';
                }
                
                if (length > 500) {
                    this.value = this.value.substring(0, 500);
                    charCount.textContent = '500/500 characters (maximum reached)';
                    charCount.style.color = '#f44336';
                }
            });
        }

        if (ratingButtons.length > 0) {
            ratingButtons.forEach(button => {
                button.addEventListener('click', function() {
                    const rating = this.getAttribute('data-rating');
                    
                    ratingButtons.forEach(btn => {
                        btn.classList.remove('active');
                    });
                    
                    this.classList.add('active');
                    
                    if (ratingInput) {
                        ratingInput.value = rating;
                    }
                    
                    this.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        this.style.transform = '';
                    }, 150);
                });
            });
        }

        if (feedbackForm) {
            feedbackForm.addEventListener('submit', function(e) {
                e.preventDefault();
                
                const message = document.getElementById('message').value.trim();
                if (!message) {
                    alert('Please enter your feedback message.');
                    document.getElementById('message').focus();
                    return;
                }
                
                const formData = {
                    name: document.getElementById('name').value.trim(),
                    email: document.getElementById('email').value.trim(),
                    feedbackType: feedbackType.value,
                    message: message,
                    rating: ratingInput ? ratingInput.value : '',
                    timestamp: new Date().toISOString()
                };
                
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        Submitting...
                    `;
                }
                
                setTimeout(() => {
                    console.log('Feedback submitted:', formData);
                    
                    if (feedbackSuccess) {
                        document.getElementById('feedbackFormContainer').style.display = 'none';
                        feedbackSuccess.style.display = 'block';
                    }
                    
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = `
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                            </svg>
                            Submit Feedback
                        `;
                    }
                }, 1500);
            });
        }

        if (closeSuccessBtn) {
            closeSuccessBtn.addEventListener('click', function() {
                if (feedbackSuccess) {
                    feedbackSuccess.style.display = 'none';
                }
                document.getElementById('feedbackFormContainer').style.display = 'block';
                closeFeedbackModal();
                resetForm();
            });
        }
    }

    function openFeedbackModal() {
        if (feedbackModal) {
            feedbackModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            
            resetFeedbackForm();
            
            setTimeout(() => {
                const firstInput = feedbackForm.querySelector('input, textarea, select');
                if (firstInput) firstInput.focus();
            }, 100);
        }
    }

    function closeFeedbackModal() {
        if (feedbackModal) {
            feedbackModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    function resetFeedbackForm() {
        if (feedbackForm) {
            feedbackForm.reset();
            if (ratingInput) {
                ratingInput.value = '';
            }
            
            ratingButtons.forEach(btn => {
                btn.classList.remove('active');
            });
            
            if (charCount) {
                charCount.textContent = '0/500 characters';
                charCount.style.color = '#666';
            }
            
            document.getElementById('feedbackFormContainer').style.display = 'block';
            if (feedbackSuccess) {
                feedbackSuccess.style.display = 'none';
            }
        }
    }

    // ===== UTILITY FUNCTIONS =====
    function scrollToSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            const headerHeight = document.querySelector('header')?.offsetHeight || 80;
            const elementPosition = section.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;
            
            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    }

    function addToastStyles() {
        if (!document.querySelector('#toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
              
            `;
            document.head.appendChild(style);
        }
    }

    function addNotificationStyles() {
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                
            `;
            document.head.appendChild(style);
        }
    }

    function addScrollFixStyles() {
        if (!document.querySelector('#scroll-fix-styles')) {
            const style = document.createElement('style');
            style.id = 'scroll-fix-styles';
            style.textContent = `
              
            `;
            document.head.appendChild(style);
        }
    }

    function showToastMessage(message) {
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-check-circle"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    function showNotification(message, type) {
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        `;
        
        document.body.appendChild(notification);
        
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    function initializeOrderConfirmation() {
        console.log('Initializing order confirmation page...');
        
        // Try to load order from localStorage
        const savedOrder = localStorage.getItem('currentOrder');
        if (savedOrder) {
            try {
                const order = JSON.parse(savedOrder);
                updateConfirmationDetails(order);
            } catch (e) {
                console.error('Error loading saved order:', e);
            }
        } else if (userData.orders && userData.orders.length > 0) {
            // If no saved order, use the most recent order
            const latestOrder = userData.orders[userData.orders.length - 1];
            updateConfirmationDetails(latestOrder);
        }
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (successModal && successModal.classList.contains('active')) {
                successModal.classList.remove('active');
            }
            if (resetSuccessModal && resetSuccessModal.classList.contains('active')) {
                resetSuccessModal.classList.remove('active');
                showLoginForm();
            }
            
            document.querySelectorAll('.modal[style*="display: flex"], .modal[style*="display: block"]').forEach(modal => {
                modal.style.display = 'none';
            });
            
            // Also close order panel if open
            const orderPanel = document.getElementById('order-details-panel');
            if (orderPanel) {
                orderPanel.classList.remove('active');
                setTimeout(() => {
                    orderPanel.remove();
                }, 300);
            }
        }
        
        if (e.key === 'Enter' && !e.target.matches('textarea, input[type="text"]')) {
            const activeForm = document.querySelector('form:not([style*="display: none"])');
            if (activeForm && activeForm.checkValidity()) {
                const submitBtn = activeForm.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.click();
            }
        }
    });

    window.addEventListener('error', function(e) {
        console.error('Application error:', e.error);
        if (e.error.message.includes('is not defined')) {
            console.log('Please check your JavaScript syntax and variable names');
        }
    });

    setupRealTimeValidation();

    init();
});

// ===== NEW FUNCTION TO INITIALIZE ADDRESS EVENTS =====
function initializeAddressEvents() {
    console.log('Initializing address events...');
    
    // This function will be called from DOMContentLoaded
    // The actual event listeners are set up in initializeProfileEvents
}

// Global Functions for HTML onclick handlers
window.goBack = function() {
    window.showPage('products');
};

window.showPage = function(pageName) {
    const pages = {
        login: document.getElementById('login-page'),
        signup: document.getElementById('signup-page'),
        products: document.getElementById('products-page'),
        profile: document.getElementById('profile-page'),
        cart: document.getElementById('cart-page'),
        checkout: document.getElementById('checkout-page'),
        confirmation: document.getElementById('confirmation-page')
    };
    
    // Hide all main pages
    Object.keys(pages).forEach(key => {
        if (pages[key]) {
            pages[key].style.display = 'none';
            pages[key].classList.remove('active');
        }
    });
    
    // Hide all info pages
    document.querySelectorAll('.info-page').forEach(page => {
        page.style.display = 'none';
    });
    
    // Show selected page
    if (pages[pageName]) {
        pages[pageName].style.display = pageName === 'login' || pageName === 'signup' ? 'flex' : 'block';
        pages[pageName].classList.add('active');
        window.scrollTo(0, 0);
    }
};

window.showInfoPage = function(pageId) {
    // Hide all main pages
    document.querySelectorAll('#login-page, #signup-page, #products-page, #profile-page, #cart-page, #checkout-page, #confirmation-page').forEach(page => {
        if (page) {
            page.style.display = 'none';
            page.classList.remove('active');
        }
    });
    
    // Hide all info pages
    document.querySelectorAll('.info-page').forEach(page => {
        page.style.display = 'none';
    });
    
    // Show selected info page
    const infoPage = document.getElementById(pageId);
    if (infoPage) {
        infoPage.style.display = 'block';
        infoPage.scrollIntoView({ behavior: 'smooth' });
    }
};

window.toggleFAQ = function(element) {
    const faqItem = element.closest('.faq-item');
    if (faqItem) {
        faqItem.classList.toggle('active');
        
        const otherItems = document.querySelectorAll('.faq-item.active');
        otherItems.forEach(item => {
            if (item !== faqItem) {
                item.classList.remove('active');
            }
        });
    }
};

window.searchFAQs = function() {
    const searchTerm = document.getElementById('faqSearch')?.value.toLowerCase() || '';
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question h3')?.textContent.toLowerCase() || '';
        const answer = item.querySelector('.answer-content')?.textContent.toLowerCase() || '';
        
        if (question.includes(searchTerm) || answer.includes(searchTerm) || searchTerm === '') {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
};

window.contactSupport = function() {
    alert('Customer Support:\n\n📞 Phone: 1800-123-4567\n✉️ Email: support@organicmart.com\n🕒 Hours: 8 AM - 10 PM (Mon-Sat)\n\nOur team is ready to help you!');
};

window.startReturn = function() {
    const userData = JSON.parse(localStorage.getItem('organicMartUserData') || '{"isLoggedIn": false}');
    if (userData && userData.isLoggedIn) {
        window.showPage('profile');
        setTimeout(() => {
            const ordersTab = document.querySelector('.profile-nav-item[data-tab="orders"]');
            if (ordersTab) ordersTab.click();
            alert('Please go to My Orders section and click on "Return Item" next to the product you want to return.');
        }, 500);
    } else {
        alert('Please login to start a return.');
        window.showPage('login');
    }
};

window.openLiveChat = function() {
    alert('Live Chat is currently under maintenance. Please contact us via phone or email.\n\n📞 1800-123-4567\n✉️ support@organicmart.com');
};

window.demoTracking = function() {
    const userData = JSON.parse(localStorage.getItem('organicMartUserData') || '{"orders": []}');
    if (userData && userData.orders && userData.orders.length > 0) {
        const orderId = userData.orders[userData.orders.length - 1].id;
        if (window.showOrderTracking) {
            window.showOrderTracking(orderId);
        }
    } else {
        alert('Demo Tracking:\n\nOrder #OM123456\nStatus: Out for Delivery\nExpected Delivery: Today, 2:00 PM - 4:00 PM\nDelivery Agent: Rajesh Kumar\nContact: +91 9876543210\nTracking Number: TRK1234567890');
    }
};
// Export for CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        validateEmail,
        validatePhone,
        switchTab,
        showResetStep,
        handleLogin,
        handleSignup,
        filterCategories,
        searchProducts,
        showInfoPage,
        toggleFAQ,
        searchFAQs,
        contactSupport,
        startReturn,
        openLiveChat,
        demoTracking,
        calculateDistance,
        calculateDeliveryCharge,
        geocodeAddress,
        updateDeliveryChargeFromAddress
    };
}