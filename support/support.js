(() => {
    fetch('https://raw.githubusercontent.com/Psyyke/psyyke/refs/heads/main/json/products.json?' + new Date().getTime())
        .then(response => response.json())
        .then(async data => {
            const productArr = data;
            const productContainer = await waitForElement('#product-container');

            if (productArr.length > 0) {
                let selectedProducts = [];
            
                if (productArr.length > 3) {
                    const sortedProducts = [...productArr].sort((a, b) => a.price - b.price);
            
                    const inexpensiveItem = sortedProducts[0];
            
                    const remainingProducts = sortedProducts.slice(1);
                    const randomSelection = remainingProducts
                        .sort(() => 0.5 - Math.random())
                        .slice(0, 2);
            
                    selectedProducts = [inexpensiveItem, ...randomSelection].sort((a, b) => a.price - b.price);
                } else {
                    selectedProducts = [...productArr].sort((a, b) => a.price - b.price);
                }
            
                selectedProducts.forEach(randomProduct => {
                    const productItem = document.createElement('div');
                    productItem.innerHTML = `
                        <div class="product">
                            <div class="title">
                                <div class="name"></div>
                                <div>(<span class="price"></span> <span class="originalPrice"></span>)</div>
                                <div class="discount"></div>
                            </div>
                            <div class="container">
                                <div class="right">
                                    <div class="description"></div>
                                    <a href="" target="_blank" class="action-btn">
                                        <span data-translation-visit-product-btn>Visit</span>
                                    </a>
                                </div>
                            </div>
                        </div>
                    `;
            
                    const titleElem = productItem.querySelector('.title .name');
                    const originalPriceElem = productItem.querySelector('.title .originalPrice');
                    const priceElem = productItem.querySelector('.title .price');
                    const discountElem = productItem.querySelector('.title .discount');
                    const actionBtn = productItem.querySelector('.action-btn');
                    const descriptionElem = productItem.querySelector('.description');
            
                    titleElem.innerText = randomProduct?.title;
                    originalPriceElem.innerText = `$${randomProduct?.originalPrice}`;
                    priceElem.innerText = `$${randomProduct?.price}`;
            
                    if (randomProduct?.discount > 5)
                        discountElem.innerText = `${randomProduct?.discount}% off`;
            
                    actionBtn.href = randomProduct?.link;
                    descriptionElem.innerText = `"${randomProduct?.description ?? `We didn't write a description for this product. It didn't need one, the product is amazing.`}"`;
            
                    productContainer.appendChild(productItem);
                });
            
                productContainer.style.display = 'block';
            }            
        })
        .catch(error => console.log(error));
})();

(async () => {
    const backupLink = 'https://s.click.aliexpress.com/e/_oEaswTy?bz=300*250';

    try {
        const response = await fetch('https://raw.githubusercontent.com/Psyyke/psyyke/refs/heads/main/json/link.json?' + new Date().getTime());
        const data = await response.json();
        const dealLink = data.link;

        const dealLinkElem = await waitForElement('.get-deal-btn');
        dealLinkElem.href = dealLink ?? backupLink;
    } catch (error) {
        const dealLinkElem = await waitForElement('.get-deal-btn');
        dealLinkElem.href = backupLink;
    }
})();

document.addEventListener("DOMContentLoaded", function() {
    const lottieAnimation = lottie.loadAnimation({
        container: document.querySelector('#lottie-animation'),
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'lottie.json'
    });
});