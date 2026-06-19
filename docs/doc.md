multi user inventory management system.

# ------------------------------------------------

Firms
GST and Non-GST
Stock list
Filter: All, GST, Non-GST
If purchase from Non-GST then can’t be sold via GST
GST purchase can be sold in Non-GST
Inventory
GST (0), Non-GST (1)
Stock schema
Stock list (which stock sold to whom)
Customer list (jisko sell kara hai)
All billing tables (management)
Discount → Per party or item-wise
Challan → Add item
1 = GST
0 = Non-GST (per item)
If 0 then GST = 0/-
Challans are saved in DB per product
Billing is weekly or manually posted
All items are taken from challan and bill is created company-wise or customer-wise
Create bill button (select parties)
Challan deleted and converted to bill
Purchase return → Payment return
Items returned and added to stock
Prepaid amount is deducted from next bill (show option on side of bill)
Every client will have credit and debit
Enter details of parties prior (easy switch between old software to new software)
GST + Non-GST will have different bank transactions, everything will be same
(purchase, cash, bank, credit modes)
Platform may have multiple users managing their own business inventory
They are editable by our client

# ------------------------------------------------

there are users:

# Maheshwari motors (MM) (my client) and other users

MM will manage username and password of the other users.
every user will have these functionalities (MM is also a user but will have one additional functionality which none other user will have that is manage password and username of other users. we call MM the 'main' user and others 'secondary' user to differentiate):

- manage their own inventory in the project
- have a dashboard where we will show all the summary
- manage their own firms (a user can have multiple firms eg. 'GST/NON_GST' or multiple)
- every user can have multiple firms (the user's company)
- every user will have multiple parties (the companys which user's firm will sell items to)
- users can add and manage items (items will also have 1 image)
- create challans which are store in db. later either weekly, monthly or manually multiple challans can be converted to bills. once a challan is converted to bill, its detail will only be shown in bill and not anymore in the challan table. it will exist in challan db but wont be visible to user. This is only to optimize the db to store challan in challan db and store the list of challan \_id's in the bills.

flow:

- user will auth using username and password (MM password will be set manually in db, and secondary user's credentials will be managed by MM).
- rest is mentioned above and in screenshot I attached.

tech stack of backend:

- Nodejs
- Expressjs
- MongoDB for all data (make it optimized without negotiating features)
- aws s3 for images to store

rest you already know the schema I made, dont addon anything from your side blindly, ask me everything which you want to re-assure, we need to exactly match client requirements
every user will maintain 2 firms (GST, NON_GST)

# !! IMPORTANT !!

there is one major scene in this project which is the core of this project.
if the user sell any product to any party in nongst bill, the stock will not have any deduction in the items of that specific bill. the client wants that if he sells items in nongst firm, there will be no deduction from physical stock but if he sells from gst firm, the stock will deduct. so there will be 2 values, one stored in gst firm and one in nongst firm to check how much stock of each item is sold (logically deducted but not physically) and gst firm will sell items based on physical stock while nongst on logical stock.
this is confusing but he wants to hide the black sales and convert it into white indirectly. and this is the MVP of the product

# ------------------------------------------------

clarifying questions:

1. Users & Firms:
   You mentioned "every user will maintain 2 firms (GST, NON_GST)" but also said "multiple firms". Is it exactly 2 firms per user always, or can they have more?

2. Items & Stock:
   Are items global per user, or are they firm-specific? For example, if a user has "Engine Oil" item, can it be sold via both GST and NON_GST firm?
   For stock tracking, is the stock_count at item level (global) or do we need separate stock per firm? Is there a purchase flow where users add stock (from suppliers), or do they just manually update stock_count?

3. Challans & GST Rules:
   In challan, does each item have its own GST flag (1=GST, 0=Non-GST), or does the whole challan belong to GST or NON_GST firm?
   The rule "If purchase from Non-GST then can't be sold via GST" - does this mean we need to track purchase source for each stock unit?

4. Party Credit/Debit:
   Credit = Amount party owes to firm (unpaid bills)?
   Debit = Advance payment / prepaid amount party has given?

5. Transactions:
   Is the Transaction model for:
   Only payments received from parties?
   Or all types (sale, purchase, refund, advance)?
   What are the payment modes exactly? (cash, bank, credit - any others?)

6. Challan → Bill Conversion:
   When converting challans to bill, is the bill amount simply sum of challan amounts, or are there adjustments (discounts, prepaid deduction)?
   Does the bill store the individual items or just references to challan IDs?

7. Party vs Company:
   In the current schema, I created both Party (customers you sell to) and Company. Are these the same thing, or is "Company" something different (like a supplier)?

8. Dashboard "Total firms (today, monthly, all)":
   Firms are static entities. Did you mean total challans/bills for today/monthly/all?

9. Stock Alerts:
   Should stock alerts be auto-generated when stock goes below threshold, or is it just a query-based report?

10. Image Storage: Confirm: 1 image per item, stored in AWS S3. Should I implement the S3 upload flow now?

# ------------------------------------------------

1. for now 2 firms
2. items are global to user and they can choose if they want to sell particular items in which firm. (the challan & bill will be created in name of that selected firm). stock tracking is global. for now just manually update stock_count.
   > a user can sell or purchase an item either with a gst bill or nongst bill. If this user purchases items in gst, then he can sell those items in nongst or gst both. but if items are purchased in nongst bill, they can only be sold in nongst challan and nongst bills.
   > so this is basically a inventory management and billing software for our client which he will use for himself and will create challans and bills and track all things, and he wants to connect other users to use the same platform thats why there are multiple users (main is this client MM and other users he connects are secondary).
3. whole challan either belongs to gst or nongst. the "if purchased..." rule I mentioned in above point in detail.
4. Make it like "Overpaid, Due"
5. Transactions are manually entried by the user. he marks if the payment of certain bill is done or not. If the bill is completed (marked by user) it is added to transactions. transactions will be of two types (Sale/Purchase). sale means the items sold by user to party and purchase means the user purchase items from others to refill stock.
6. when challans are converted to bill, the bill will have total calculated amount. Discount will be on per challan so when calculating bill charge, the discounted price of all challans will be added in total. bills will only store references as this makes more sense to me. The client wants to delete challans if bill is generated but my idea is to still store for referencing in bill but dont show it to user in frontend so the user can see which challans were added and what metadata does that challans holds (when created, disc, amt, etc).
7. there are 2 entities for user:
   Party - the one to whome the user will sell items to
   Supplier - the one from whome the user will purchase items to refil stock
8. summaryze most of entries you think is needed to show in dashboard. the frontend developer added (total firms count, total challans created count, total bills created count, count of items on low stock, most recent 10 challans list and most recent 10 bills list).
9. stock alerts will auto generate when stock of any item goes below the threshold amount set to the item while creating. My idea is to check when the item is sold so we dont have to listen or loop it.. so once a item is sold and while deducting the value, we check if the stock went below threshold or not.
10. yes one image per item will be there and is uploaded from frontend at the time of item creation

# ------------------------------------------------

a few things:

1. Auth & Firm Selection Flow:
   After login, user selects a firm. Should I:
   (A) Include firm_id in every API request body/params?
   (B) Store selected firm_id in JWT token (user would need to re-login or call an API to switch firms)?
   (C) Use URL path like /api/v1/firm/:firmId/challans?

2. Main User managing Secondary Users:
   Can main user delete secondary users, or only create/edit?
   Can main user see/access data of secondary users, or just manage their credentials?

3. S3 Image Upload:
   Should I implement complete S3 integration now, or just structure it (you add AWS credentials later)?

4. Stock Deduction on Challan:
   When a challan is created, should stock be automatically deducted?
   Or is stock deduction manual/separate?

5. Purchase Return Flow:
   When items are returned, should I:
   Create a "return" record that references original purchase/bill?
   Or just adjust stock counts?

6. Overpaid Amount (Prepaid):
   "Prepaid amount deducted from next bill" - should this be automatic or manual selection by user?
   Should I track party-level credit/debit balance?

7. Bill Number & Challan Number:
   Should these be auto-generated (sequential per user/firm)?
   Or user enters manually?

8. Reports:
   Are reports just API responses, or do you need actual PDF generation?

# ------------------------------------------------

1. use url path like /api/v1/firm/:firmId/challans
2. main user can either create, edit and delete the secondary users
3. completely integrate the s3, I will simply just add apis to env once I make an account. complete the backend portion 100% so I will just have to add api keys in the end.
4. yes, when challan is created, the stock should be deducted of those selected items and what count of items are being sold to party or purchased from supplier. this process should be automatic.
5. simply just adjust stock counts because the purchase and sale bills will be created by the user manually by filling a form in frontend so the amount he mentioned in the bill will auto add/deduct from the item stock count.
6. If lets say a buyer A buys 10 items costing 100 each and A returns 2 items (or only takes 8 items after paying 1000) so we dont refund them the money, we simply discount them the exact amount of 200 from their next bill of anything 3. it is a website made in react and my role is to do the backend 4. a user will be able to manage their own firms (gst & non gst) and can use this as a billing software 5. auto generated (generally the \_id) also: what if we just maintain a per client amount? lets say they purchase 10 items for 1000 (100 each) and they take only 8 or return 2 so their client_amount = 1000 = 200 (-8 items / 2 refunded) positive means they over paid and negative amount means we need to discount them. Show this entry along with bill amount that this prepaid or due amount is being subracted from the total bill and the user can choose to apply or not apply it in that bill (checkbox) but the user cant delete the prepaid or due amount to trick the party.
7. bill and challan numbers can simply be \_id in mongodb.
8. reports will just be a json data for now, it will be shown visually in the frontend using graphs, etc

# ------------------------------------------------

Discount details:
Discount can be added in 3 types:

1. per item discount
   - means while creating challan, user can decide to give discount to particular items in the challan. Lets say user adds 3 items (X,Y,Z) and chooses to give 5% disc to item X and 3% to item Y and no disc to Z. so the bill generated will be ((total_cost_of_n_X_items - 5%) + (total_cost_of_n_Y_items - 3%) + total_cost_of_n_Z_items)

2. per challan discount
   - means while creating a challan, user can decide to give discount to the whole challan. lets say the challan amount is 1000, and user choose to give a 10% discount to the whole challan then the challan amount will be 900.

3. if the user choose to do both then the final amount will be:
   (((total_cost_of_n_X_items - 5%) + (total_cost_of_n_Y_items - 3%) + total_cost_of_n_Z_items) - 10%)

these discount values will be given from frontend to backend.

# ------------------------------------------------

(0:00:00) The main concept is non-JLC, GSC, which was different. The discount structure is different. The challenge concept is different.
(0:00:20) We will talk about the whole thing and then we will add further. That concept is zero. That concept is not further. First of all, we are working on the product. Then we will talk about the product of LinkedIn. That's why we are working on our flow. Okay. That's why we are talking about coding. If you are talking about the product, I have three columns. Okay, sir. You have three columns.
(0:00:44) First percentage, second percentage and third percentage. Some amount. Some amount, okay. Yes. Okay, so this is the idea that you have to discount party-wise, and party-wise also discount item-wise. Any party has to discount all items, group-wise. That is the first action. The other option is that you have to go to the last sell.
(0:01:14) And the third option is to select that I have a purchase rate for 100 rupees and 2% of profit and sell me. That is the third option. You should have a discount option in these three structures. Okay sir. So if you are working on it, you call for the third day. Every day I call, that will go. But when you are working on it,
(0:01:39) If you do that, it will be better. However, there is inventory flow. The inventory flow is the same as it works. Yes, sir. And the other thing is, you told me that in three databases, one is non-GST, one is GST and one is one. Yes, sir. Yes, sir. Yes, sir. But now, let me believe that I have logged in to GST. Now, I will be back up, then it will be GST database. It will be the stock, whatever it will be.
(0:02:09) You have logged in your company, but I have given your users that they can see the auto firms. Sir, you can see the three options here. The one who is right will be able to see it. But you don't understand. In the database, there is a place where you have rights. You have not given rights, but there is a place where it is on the page. Absolutely, sir. So, you can do that directly? It's like a team form.
(0:02:35) It's about user access.
(0:03:08) Okay. Our team will listen to the call. Yes sir. I will listen to the call. Exactly, I will say. But I would like to use the username and password. Why? I will also be an administrator. You are an administrator. I am an administrator. My password has been written. My password has been written. That's good. The base is that I will leave the username and password. If you add the username and password, then the password will open.
(0:03:38) And the user name or password will not be added. The other one will be added to the GST, then the GST will open. So, both of them will be added to the login. Yes. So, I understood that one is GST and non-GST. Exactly. So, I will give you two login. Yes, I will give you two login and we will combine them somewhere else. Yes, okay.
(0:04:01) I mean, based on India, what you are seeing on this channel, this will come first and the login credentials will come later. Okay? And this will be the source of the data. It will be the source of the concept. Sir, I will show you both. No, no, no, no. Okay, okay. You have done this. I will show you both. No, no, he is asking you. No, no, no. Listen to me. Wow.
(0:04:31) I was using this way, that there is a data in the source. That means that the entry I made in GST, purchased in GST or in the source. So GST and source of combination is source. It is a merge. It is a merge in the other and the third form. It doesn't have to take it from physical stock.
(0:04:58) Now, if I open a physical stock, if I open it for physical stock, I have thought of this option. Whenever I sell, or whenever I purchase, I will give this option that if I have done this, I won't have to take it from physical stock. Okay. Sir, we put this stock in a different way. We put this stock in a different way.
(0:05:27) Look, I have an example. Yes sir, tell me. If I had 100 items in the GST firm in the GST firm. Okay. So what happened to my physical? 100. Okay. Now I have sold it in the non-GST. Okay. 100 sold out. Where did it? Non-GST. So how much my physical stock happened? Zero. Zero.
(0:05:56) Okay, but my logical stock is 100. GST stock. Yes, I understand. Exactly. How can I buy this? Yes, I understand. We will convert it into virtual stock. We will shift it into virtual stock. Okay. Because the stock is finished, but we have it. Yes, we have it. Yes, I understand. Then you can use it. Okay.
(0:06:26) Yes, I can sell it. If I sell it, I can sell it. Yes, I can sell it. Yes, I can sell it. Yes, I mean you can sell it. Exactly. When I make a bill, when I make a stock minus, it will be minus 100. Right. So, I have to give an option that I don't have any calculation with that stock. Okay. So, sir, I have to steal it. Do you know?
(0:06:56) I thought I was going to go out. But if you manage it, it's different. You can do something like this before you think about it. That if people buy a secret key, then there won't be a stock calculation in this stock. You can do something like this before you think about it. We can do something like this. We can manage it 100% sir. We can manage it completely. Yes, then we can go out of it. It will be confusing.
(0:07:26) Actually, I'm doing this right now, but in the future, I don't have to think about it. I can think about it. It's more difficult to understand people. That's right, sir. That's why I want to keep non-GST and GST firm in this way. Sir, I want to take a deep discussion from the whole team. Sir, I want to connect with you tomorrow night or tomorrow. I want to make a solution for me.
(0:07:50) I will present them in front of you. Then we will discuss them and we can do better. Okay, done. Another, if you are creating a master or going on a master, then you have to waste 10 minutes, but then you have to study all the time. No, sir, I will call myself. I have told myself that I will connect to my master for a second, which I have lost in all of them. Yes, sir. Every master has a job. Every master has done it.
(0:08:21) foreign foreign foreign foreign
(0:08:40) How do we do this? How do we do this? How do we do this work? 50-60% of our employees have done it. Now, we are talking about discount and master and our GST management. I will apply it on the app and we will start working on the app. And the other thing, I would like to ask you about the GST number and the data has already been captured. Is there an option for us? GST is the name of the company?
(0:09:06) No, you are like Vyapar, BZ, many software. If you have a software in your name, you are like GST number, the party will already get all the details. Yes, sir, you have to purchase API. Okay, so you have to say that. I will tell you the API pricing. Okay. Okay, sir. Okay, sir. Okay, sir. Okay, sir. Okay, sir. Okay, sir.
(0:09:36) Hello? I was talking about the first time I was talking about the first time, so I can't say anything. I need to start the first time. No, sir, it's true. Sir, we are making this recording and our show. I have understood your story. You will be honest with yourself. You will have 50% of it. But until I start, I will not be able to think about it.
(0:10:00) सार में इतना बताया भी इतना तो इतना तम कल पर सो तक तो दे दोगे ना बना ने ने ने मोग कल पर से मीटिंग करूँगा कि इस तरीक से कर लें क्या तो इसके लॉजिक बनाने पड़ेंगे इसके इसके बहुत बड़ी चीज है इसके लॉजिक बनाने पड़ेंगे इसके ब
(0:10:27) तो सब्सक्राइब पूछ लो और उसके वाद उसके काम करना स्टार्ट करो ठीक है सरा मुझे कल श्राम तक का टाइम दो मैं तीम की सब्सक्राइब करके आपन कल श्राम करना स्टार्ट कर देता है क्योंकि क्योंकि काम इसको इसको काम स्टार्ट करना है तो समय देना बात को त
(0:10:54) सब जाके मुझे पर डे की कोई भी जो भी प्रॉब्लम्स होगी वह दिखने चालो होगी सब्सक्राइब बिल्कुत सब्सक्राइब तो तो तो तो तो मुझे बता दो जी सर कल शाम को इस टाइम हो पाया तो अपने मीटिंग करते हैं और अपने बेंस्टॉंग कर लेते हैं उस

# ------------------------------------------------

Discount – 3 column

%   2. %   3. Amount

• Discount:

item wise: every item has their own dis

item group wise: group multiple items & apply dis on that group

purchase rate hai → use % of profit like sell karna!

• Every firm have their unique credentials
• Unique admin creds → user management
• GST + Privat = Privat
when I sell → I tick an option in bill then it won’t have any affect in physical stock

every user will have only 2 firms: GST & NON-GST

this project is getting too confusing omg... do you get what he wants?

He wants strictly 2 firms per user (GST & NONGST) and credentials will be of firms and not users anymore. also there will be a credentials for admin too who will have access to user management.

update the backend and write me a md file in easiest and simplest words for my frontend developers for them to understand the project

# ------------------------------------------------

stock management:

- items purchased from nongst supplier dont add on in stock, it is only sold

# ------------------------------------------------

```json
User {
type: "secondary" (enum ["main", "secondary"])
common firm data,
stock = 0,
gst_firm {
credentials: {username, password}
data: {challans, bills, items, transactions}
},
non_gst_firm {
credentials: {username, password}
data: {challans, bills, items, transactions}
},
admin: null
}

User {
type: "main" (enum ["main", "secondary"])
common firm data,
stock = 0,
gst_firm {
credentials: {username, password}
data: {challans, bills, items, transactions}
},
non_gst_firm {
credentials: {username, password}
data: {challans, bills, items, transactions}
},
admin: {
credentials: {username, password}
}
}

login as gst firm sends: {
is_admin: true/false
common firm data,
firm_data: {gst firm data}
token:
// and rest other necessary things
}

login as non-gst firm sends: {
is_admin: true/false
common firm data,
firm_data: {non-gst firm data}
token
// and rest other necessary things
}

login as admin sends {
is_admin: true/false,
token:
// and rest other necessary things which I dont think is any more
}
```

# ------------------------------------------------

ui flow in frontend:
login > if logged in as gst/nongst firm > dashboard (containing all things)
login > if logged in as admin > user management screen only with nothing else to create/edit/delete any credentials

# ------------------------------------------------

DATA SEPERATION:
common:

- items (view & manage)
- category (view & manage)
- supplier (view & manage)
- create challans // (challans can be created for gst or nongst (there will be a dropdown in every item in challans [0, 1] 0 for nongst and 1 for gst) that 0 or 1 will decide which items will go in the gst challan and which ones will go in nongst challan. so technically user created one challan and mixed gst and nongst items in it and as he presses save challan button in frontend > frontend will send all items and other details to backend > backend seperates items with 0 and 1 > creates 2 challans and saves as: [if 0 then save in nongst_firm data else if 1 then save in gst firm data])

gst firm data:

- gst transactions
- gst challans
- gst bills
- gst reports

nongst firm data:

- nongst transactions
- nongst challans
- nongst bills
- nongst reports

so to optimize my idea is to create 3 collections and add reference in each other:

- USER
- FIRM
- ADMIN

relation:

```json
USER {
   data: { // common data
      items, categories, suppliers, etc
   }
   gst_firm: ObjectId of FIRM
   nongst_firm: ObjectId of FIRM
   admin: ObjectId of ADMIN
}

FIRM {
   type: "1" or "0" (1 for gst & 0 for nongst)
   credentials: {username, password}
   firm_info: {name, phone, address, godown address, city, state, reg no, cin, bank name, ifsc code, email, account no}
   data: {challans, bills, items, transactions}
   user: ObjectId of USER
}

ADMIN {
   credentials: {username, password}
   user: ObjectId of USER
}
```

# ------------------------------------------------

```json
User {
   \_id,
   type: "secondary" (enum ["main", "secondary"]),
   data: { // common data
      items, categories, suppliers, etc
   },
   stock = 0,
   gst_firm {
      credentials: {username, password}
      firm_info: {name, phone, address, godown address, city, state, reg no, cin, bank name, ifsc code, email, account no, gstin}
      data: {challans, bills, items, transactions}
   },
   non_gst_firm {
      credentials: {username, password}
      firm_info: {name, phone, address, godown address, city, state, reg no, cin, bank name, ifsc code, email, account no}
      data: {challans, bills, items, transactions}
   },
   admin: {username, password} or null
}
```

# ------------------------------------------------

Category1

- Brand1 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand1's item1
- - Brand1's item2
- - Brand1's item3

- Brand2 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand2's item1
- - Brand2's item2
- - Brand2's item3
- - Brand2's item4

Category2

- Brand1 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand1's item1
- - Brand1's item2
- - Brand1's item3

- Brand2 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand2's item1
- - Brand2's item2
- - Brand2's item3
- - Brand2's item4

in collection:

```json
   CATEGORY {
   ObjectId[] of BRAND
   ...
}

BRAND {
   ObjectId[] of ITEM,
   discounts: {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
   ...
}

ITEM {...}
```

# ------------------------------------------------

```json
{
   type: 0 or 1, (1 = gst, 0 = nongst),
   items: ObjectId[] of ITEM,
}
```

item will have fields, modified by frontend at the time of challan creation:
item id, type, pcs, discount amount
as per this image: D:\Projects\flutter_projects\ROYAL\maheshwari-motors\Challan.jpg

# ------------------------------------------------

frontend sends:

API - /add category / update

```json
{
  "category_name": "",
  "brands": [] // list of BRAND object IDs
}
```

API - /add brand / update

```json
{
  "brand_name": "",
  "items": [] // list of ITEM object IDs
}
```

API - /add discount / update

```json
{
  "brand_id": "", // BRAND object ID
  "discount1": { "normal": 2, "special": 0 },
  "discount2": { "normal": 3, "special": 0 }
}
```

```json
API - /delete category
{ "category_id": ""} // CATEGORY object ID

API - /delete brand
{ "brand_id": ""} // BRAND object ID
```

# ------------------ 24/Feb/2026 ------------------------------

> LABEL WISE DISCOUNT

Category will have labels now and label will have n brands in it and every brand have items.
user will choose to apply label to certain challan and it will load that discounts in the challan.
labels will be assigned to party and that will be assigned to the party in challan.
here is how labels will be:
every label will have same brands but different discount numbers %

category i

- label A
- - brand 1 {disc1: {normal: 0,special: 0}, disc2: {normal: 0,special: 0}}
- - brand n {disc1: {normal: 2,special: 0}, disc2: {normal: 2,special: 0}}
- label B
- - brand 1 {disc1: {normal: 2,special: 0}, disc2: {normal: 2,special: 0}}
- - brand n {disc1: {normal: 1.5,special: 0}, disc2: {normal: 3,special: 0}}

category ii

- label A
- - brand 1 {disc1: {normal: 2,special: 0}, disc2: {normal: 0,special: 5}}
- - brand n {disc1: {normal: 0,special: 3}, disc2: {normal: 0,special: 0}}
- label B
- - brand 1 {disc1: {normal: 1.5,special: 0}, disc2: {normal: 0,special: 10}}
- - brand n {disc1: {normal: 0,special: 0}, disc2: {normal: 2,special: 0}}

> PARTY MASTER

party will now also have a image of 'signature'
party will also have a label assigned to it (label will have the discount details as mentioned above)
when user creates challan, he will select the party and based on that party's assigned label, the discount details will be auto filled in the challan (but user can edit those discount details if he wants to)

> BANK MASTER (new)

every firm can have multiple bank accounts. so both firm will have a list of bank objectIds from bank collection.
these bank will be choosen at the time of challan creation, from which bank the transaction will be done of that bill.
means if the bill is purchase bill, the bank here means, the payment is done from this bank to the supplier whereas if the bill type is sale, this means the amount will be transferred to this specific bank from the party.

bank master will also have one more option:
if a party P1 has 5 bills and each bill is of amount 2000. and the client pays 7000. now the 3 of the bills will be settled in 6000 from the client. and the remaining 1000 will have 2 options which user will choose while creating 'Payment return' in 2 > 4 types 'bank transaction recieved amount', 'cash payment recieved amount', 'bank transfer payment given' & 'cash payment given'. the first 2 are for payment returned from party and the second 2 are for returning to supplier.
the user must have full control of the payment how he wants to settle it with the bills (not challans but bills).
the remaining 1000 can have 2 possibilities:

1. settle it with 4th bill (2000 - 1000) and the bill's outstanding or due amount = 1000. so the bill now has: {amount: 2000, due: 1000, paid: 1000} kind of.
2. unsettled - the 1000 will be added to the party and will be considered as unsettled amount so when it is deducted from the bill, it will be settled in verbal terms.

> STOCK

stock now have 2 stocks:

1. physical_stock (the actual stock count) (gst stock - show only in gst firm login)
2. logical_stock (the logical stock count) (nongst stock) (when login in nongst firm, show stock = physical + logical) (so logical can go below 0 but not physical or gst stock) (gst stock will always be >= 0)

- when items are sold in gst challan, physical_stock will be deducted
- when items are sold in nongst challan, logical_stock will be deducted but physical stock will not be deducted
- when items are purchased in gst challan, physical_stock will be added
- when items are purchased in nongst challan, logical_stock will be added but physical stock will not be added

example:
gst stock = 100
nongst = 10
sold 50 items from nongst firm
gst stock = 100
nongst stock = 10 - 50 = -40 (logical stock)
sold 30 items from gst firm
gst stock = 100 - 30 = 70
nongst stock = -40 (logical stock)
now, stock shown in gst firm = 70,
stock shown in nongst firm = 70 + (-40) = 30

> PARTY WISE ITEM DISCOUNT

party will have a list of item wise discount details which will be applied when that party is selected in challan creation. this will be in addition to the label discount details. so if a party has both label assigned and item wise discount assigned, then in challan creation, the discount details will be auto filled based on both label and party's item wise discount details.
only map the discout to party, it will be applied in frontend at the time of challan creation and they will only give the challan item fields which will have applied discount..

> PARTY WISE TRANSPORT CHARGE

party will have a transport charge associated with them (in the party schema and required in create party) this will be applied on bills directly in frontend. It is editable at the time of bill creation from frontend.
so lets say the charge set at the time of party creation is 100, but at the time of bill, it is edited to 80. so the 80 will be stored for that bill.

> BILL MASTER

add fields in bill:

- transport id
- customer name
- vehicle number
- party wise transport charge

> SUBSCRIPTION MODEL

this project will be allotted to the users (other users as a SAAS software) and they will be provided with a 30 day demo and later can have yearly purchase plans. which will be set by admin. There will be no payment gateway in this project, the admin will take money physically and activate from admin panel.
admin needs flexible subscription details form provided [days, months, years] in timeline.
so if a user pays for 3 years and 4 months and 2 days, he can choose specifically. and everyday job will check which user plan is expiring today.

> RETURN MASTER

return master screen will have:

- dropdown of contact type : supplier / party
- dropdown of parties / suppliers
- 2 types of return : sale return / purchase return

if sale return - this means the party has returned some items. and if it is purchase return, it means we're returning some items to the supplier. In sale return, the stock will be added back and in purchase return, the stock will be deducted.
the item will have 2 values/types = {is_damaged: false}. if the item is damaged or fresh. this item can either be the one which is purchased from supplier or the one returned by the party

> PRINT PROFILES

every user can create multiple print profiles and can choose certain customizations.

example:
print profile 1: bill will be printed with barcode and no party name
print profile 2: bill will be printed with party name and barcode both

# ------------------ 26/Feb/2026 ------------------------------

> TRANSACTION MASTER

transaction collection will have all the transactions. and transactions will have a field 'type'. and transaction can have 4 of the following types:

1. bank recieved (recieved from party)
2. cash recieved (recieved from party)
3. bank payment (paid to supplier)
4. cash payment (paid to supplier)

if the transaction is a bank transaction, there will be option to choose from which bank the transaction is done or recieved in. if the transaction is a cash transaction, there will be no bank details required.

in the transaction master, there will be 4 books (basically khatabook kind of to categorise transactions and we named it books. example: cashbook, bankbook, etc):

1. cash book (cash recieved, cash payment)
2. A/C book (bank recieved, bank payment)
3. creditor (all type of payments paid (bank/cash both))
4. debitor (all type of payments recieved (bank/cash both))

form fields: transaction type dropdown, date, party dropdown, amount, reference/cheque number, remarks

# -------------------------------------

populate banks in firms
fixing bill creation error, debugging frontend and backend
inter-user item clash fix
Enhance bill and challan services with firm context validation and improved data handling
category, label hierarchy schema, service, controller updates
maheshwari app new backend endpoint updates
fix - challan values saving default to 0
Patch backend challan schema/service for label_id, populate, legacy label name response, and raw line/totals handling
Patch React frontend challan/bill forms to send label_id and full raw computed monetary fields
Update shared normalizers/seed script and run syntax checks
update billform and challan form in frontend and bill service in backend
creating maheshwari app, updating all apis and creating new screens
fixing double creation issue

# ---------------------------------------

if a party P1 has 5 bills and each bill is of amount 2000. and the client pays 7000. now the 3 of the bills will be settled in 6000 from the client. and the remaining 1000 will have 2 options which user will choose while creating 'Payment return' in 2 > 4 types 'bank transaction recieved amount', 'cash payment recieved amount', 'bank transfer payment given' & 'cash payment given'. the first 2 are for payment returned from party and the second 2 are for returning to supplier. the user must have full control of the payment how he wants to settle it with the bills (not challans but bills). the remaining 1000 can have 2 possibilities: 1. settle it with 4th bill (2000 - 1000) and the bill's due amount = 1000. so the bill now has: {amount: 2000, due: 1000, paid: 1000} kind of. 2. unsettled - the 1000 will be added to the party's outstanding amount and will be considered as unsettled amount so when it is deducted from the bill, it will be settled in verbal terms. I want user to have an option to choose between the two, keep the 1000 remaining in party's outstanding or settle it in another bill and have a due amount for the bill.

# ---------------------------------------

> LABEL UPDATE

hierarchy is changed:
label i

- category A
- - brand 1 {disc1: {normal: 0,special: 0}, disc2: {normal: 0,special: 0}}
- - brand n {disc1: {normal: 2,special: 0}, disc2: {normal: 2,special: 0}}
- category B
- - brand 1 {disc1: {normal: 2,special: 0}, disc2: {normal: 2,special: 0}}
- - brand n {disc1: {normal: 1.5,special: 0}, disc2: {normal: 3,special: 0}}

label ii

- category A
- - brand 1 {disc1: {normal: 2,special: 0}, disc2: {normal: 0,special: 5}}
- - brand n {disc1: {normal: 0,special: 3}, disc2: {normal: 0,special: 0}}
- category B
- - brand 1 {disc1: {normal: 1.5,special: 0}, disc2: {normal: 0,special: 10}}
- - brand n {disc1: {normal: 0,special: 0}, disc2: {normal: 2,special: 0}}

> BOOKS

there will be a new collection named 'Book' and this book will have following fields:

- type
- date
- id
- remarks
- is_gst
- user_id
- amount

type will be 2:

1. CashBook - payment done in cash
2. BankBook - payment done in bank

it will be a transaction but seperately stored cuz this transaction will not have a contact_id rest will be same as transaction (so you can use transactionschema for it too and add type to any of the 2 types)

we can simply add 'cashbook' and 'bankbook' to TRANSACTION_TYPES and contact_id to be null to make this..

# ---------------------------------------

> DISCOUNT MASTER

the discount master hierarchy is changed back to the one we had initially. we're back to this architecture:

Category1

- Brand1 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand1's item1
- - Brand1's item2
- - Brand1's item3

- Brand2 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand2's item1
- - Brand2's item2
- - Brand2's item3
- - Brand2's item4

Category2

- Brand1 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand1's item1
- - Brand1's item2
- - Brand1's item3

- Brand2 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand2's item1
- - Brand2's item2
- - Brand2's item3
- - Brand2's item4

but instead of 'Category' we simply rename it to 'Label'.. so it finally becomes:
Label1

- Brand1 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand1's item1
- - Brand1's item2
- - Brand1's item3

- Brand2 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand2's item1
- - Brand2's item2
- - Brand2's item3
- - Brand2's item4

Label2

- Brand1 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand1's item1
- - Brand1's item2
- - Brand1's item3

- Brand2 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand2's item1
- - Brand2's item2
- - Brand2's item3
- - Brand2's item4

> TRANSACTION MASTER

cashbook and bankbook will be 2 'contacts' which will of type 'book'.
A/C book will show all bills made in bankbook contact
CashBook will show all bills made in cashbook contact
Creditor book will show all payments made to suppliers (bank payment + cash payment)
Debitor book will show all payments recieved from parties (bank recieved + cash recieved)
cashbook and bankbook contact cannot be deleted or editted

# ---------------------------------------

> TRANSACTION HISTORY

transaction history will show all the past transactions contact wise
for example, if we click on a party P1, it will show all the transactions done with that party. if we click on a supplier S1, it will show all the transactions done with that supplier. if we click on cashbook, it will show all the transactions done in cash. if we click on bankbook, it will show all the transactions done in bank.
if we click on creditor book, it will show all the payments made to suppliers (bank payment + cash payment)
if we click on debitor book, it will show all the payments recieved from parties (bank recieved + cash recieved)

> BANK MASTER

Bank schema now have 'assignment_type' and 'assigned_to'. assignment type defines to which that bank is assigned to. for example a bank is assigned to xyz party with \_id (1234) now the bank will have following fields {assignment_type: "party", assigned_to: ObjectId(1234)}. and 'contact_id', f'irm_id is removed as their id will be assigned to 'assigned_to' so we dont need them seperately.

while adding party/supplier the user will also have an option to fill in bank details there as well or leave it empty (same in edit party/supplier).
the payload will include all the bank details > create a bank using those fields > assign it to the contact (party/supplier).

payloads while creating contacts:

> DISCOUNT MASTER

Label1

- Brand1 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand1's item1 {discount: 120}
- - Brand1's item2 {discount: 10}

- Brand2 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand2's item1 {discount: 10}
- - Brand2's item2 {discount: 10}

Label2

- Brand1 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand1's item1 {discount: 10}
- - Brand1's item2 {discount: 10}

- Brand2 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand2's item1 {discount: 10}
- - Brand2's item2 {discount: 10}

# ---------------------------------------

Item discount value — The item discount is a single number (e.g., 120, 10). What does this represent? A flat amount? A percentage? Or something else?

Where does this live? — Should these item-wise discounts be added inside the Label's brand_discounts array (i.e., each brand entry gains an item_discounts sub-array)? So the Label model becomes:

Relation to Contact's item_discounts — The Contact model already has item_discounts (per party, with discount1/discount2 having normal/special). Is this new label-level item discount separate from the contact-level item discount, or is it replacing it?x

Which items appear under a brand? — Are these the items from Brand.item_ids, or any item with item.brand_id === brand.\_id?

1. it is a direct number / discount amount
2. I want the best optimized way to store it without creating redundancy or extra storage and best relation among collections, do it however is the most optimized way
3. remove the item discounts from contacts
4. Brand.item_ids & item.brand_id are the same thing but use Brand.item_ids which makes more sense and u wont have to loop through all items to get them, we will directly get the array from brand.

# ------------------ 11 march 2026 ----------------------

> LABEL CREATION & BRAND CREATION

label will be created in 'label master' screen in frontend. it will have a list of label and all brands assigned to it. user will click on add label button and a label will be created. it is optional to add brands initially, the brands can also be assigned/added to label later from the same screen.

similarly,
brand will be created in 'brand master' screen in frontend. it will have a list of brand and all items assigned to it. user will click on add brand button and a brand will be created. it is optional to add items initially, the items can also be assigned/added to brand from the same screen.

in these 2 screens of label and brand creation and listing, there will be no role of any discounts. these screen will simply create labels and brands, list them and map them to each other as (label > brands in label master screen) and (brand > items in brand master screen)

the discount will only be added from the discount master screen where we will show 3 columns in sreen:
Label list | brand list per label | item list per brand

label list will show list of all labels created (names only mostly). When I click on any label > it will load all the brands assigned to it or every brand that have that respective label assigned to them in the brand list and will also have the discount 1 and discount 2 fields with it. Now when I click on a brand from the brand list > it will load all the items that belong to that brand in the item list column along with a field of item discount.

this is the flow from frontend perspective. so now from backend perspective, I need a most optimized way and apis for it to work.
apis I will need (as much I can think of):

1. list labels
2. load brands per label
3. load items per brand
4. update brand discounts
5. update item discount

these discounts are not mapped with item or brand they are mapped with labels as you already know
as the client wants it like this: while creating a challan, he will choose a label and all the brand discount and item discount will be loaded in frontend and will be applied to all items and items in brand from the frontend.

> DISCOUNT MASTER

Label1

- Brand1 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand1's item1 {discount: 120}
- - Brand1's item2 {discount: 10}

- Brand2 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand2's item1 {discount: 10}
- - Brand2's item2 {discount: 10}

Label2

- Brand1 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand1's item1 {discount: 10}
- - Brand1's item2 {discount: 10}

- Brand2 {discount1: {normal: 0%, special: 0%}, discount2: {normal: 0%, special: 0%}}
- - Brand2's item1 {discount: 10}
- - Brand2's item2 {discount: 10}

> TRANSACTION MASTER SCREEN (ADD TRANSACTION MODAL)

add transaction modal has following fields:
transactin number - auto generated from backend if left empty else check for unique
transaction type - dropdown {cash recieved, bank recieved, cash payment, bank payment}
contact - dropdown (showing all contacts + cashbook + bankbook)
date - date picker (23-02-2026)
amount - numbers
reference/cheque number - text
remarks - text
is_gst: 0 / 1

the transaction master screen has 4 tables options to choose from (kinda like navbar):

1. cashbook - shows transactions that are done in cashbook
2. bankbook - shows transactions that are done in bankbook
3. Creditor - will show all transactions made to suppliers (bank payment + cash payment)
4. Debitor - will show all transactions from parties (bank recieved + cash recieved)

> OUTSTANDING

frontend added a new screen (check image: D:\Projects\flutter_projects\ROYAL\maheshwari-motors\outstanding_list.png).
this screen has party and supplier dropdown depending on which the left list will update. if party is selected then parties will show else suppliers.

each party will have their amount mentioned under them as showin in the frontend ui (check image). when I select a party, it will show all bills in table and will have 2 filters {Due Bills, Settled Bills}. rest all fields check in the image we have to basically fill all data shown in the screen.
note: do not implement downlaod pdf button, it will be implemented on frontend

# ------------------ 12 March 2026 ---------------------

> ITEM LEDGER REPORT

ITEM DETAILS REPORT / ITEM BRAND WISE SORTING (select brand > show all items of that brand)
ITEM IN OUT WITH SALER AND PURCHER NAME FINAL STOCK (how many and what items are sold to party (per party list) and how many and what items purchased from supplier (per supplier list))
ITEM WISE SUMMARY REPORT/ ITEM BRAND WISE (overall item summary till now similar to a item dashboard)

> PURCHASE REPORT

basically whatever is purchased in the duration with filters..
SELECTED DATE WISE PURCHASE REPORT (transactions from supplier between fromDate till toDate, with all details of price, item count and everything related)
PARTY WISE OR ITEM WISE OR BRAND WISE (filter purchases (transactions) by item, party and brand. What items are purchased in the duration; this party has purchased these things in the duration; this brand items are purchased in the duration)

> SALE REPORT

SELECTED DATE WISE SALE REPORT (transactions from party between fromDate till toDate, with all details of price, item count and everything related)
PARTY WISE OR ITEM WISE OR BRAND WISE (filter sales (transactions) by item, party and brand. What items are sold in the duration; this party has sold these things in the duration; this brand items are sold in the duration)

SELECTED DATE WISE SALE REPORT
_Filters:_ PARTY WISE / ITEM WISE / BRAND WISE / AGENT WISE/ AREA WISE

> COLLECTION REPORT

_Filters:_ Party / Supplier wise table
monthly sales and (payment collected from party / payment given to supplier)

> ACCOUNT LEADGER

FOR ALL ACCOUNT TOTAL IN OUT FOR SELECTED DATE
CASH ACCONT / BANK ACCOUNT PERTICULOR BANK / PARTY / SUPPLIER

> GST REPORT

Filters: Date, Monthly report
Fields:
ITEM HSN CODE
PURCHSE RETURN
PURCHASE
SALE RETURN
SALE

> PROFIT LOSS REPORT

PROFIT / LOSS REPORT WITH SELECTED DATE OR SELECTED BILL WISE PROFIT LOSS

# -------------------------------------------

> ITEM STOCK CALCULATION ON BILLS

gst stock = 100
nongst = 10
sold 50 items from nongst
gst stock = 100
nongst stock = 10 - 50 = -40 (logical stock)
sold 30 items from gst
gst stock = 100 - 30 = 70
nongst stock = -40 (logical stock)
now, stock shown in gst firm = 70, stock shown in nongst firm = 70 + (-40) = 30

gst billing has 2 options:

1. deduct from stock
2. dont deduct from stock

1./ Deduct from stock (1)
deduct from stock is the same as mentioned in above calculation where gst stock is 100 and if 20 are sold it deducts and now the gst stock becomes 80.

2./ Dont deduct from stock (0)
lets take an example, we have 100 in gst stock and we sell 20 items and it is deducted from the stock as normal billing and stock becomes 80, but after billing, create a purchase of those exact 20 items in cashbook so the stock is now 100 back again, so indirectly we never deducted the sold items from stock..

# --------------------- 25 MARCH 2026 ----------------------

Hello. हाँ विशाल जी. यह सर जी. ठीक है. मैंने देखा, पहली बात तो आह देखिए जीरो और वन का जो कॉन्सेप्ट है ना, वो आप समझिए पूरा क्या है. पार्टी में जो जीरो और वन का जो कॉन्सेप्ट है ना, वो आप समझिए पूरा क्या है. पार्टी में जो जीरो और वन है, पार्टी जब ऐड करता है, जब जीरो का मतलब है कि वो जब चलन हम चलन की बात कर रहे हैं, बिल की बात नहीं कर रहे हैं, ध्यान रखना. चलन जब बने तब आइटम अगर जीरो होगी तो जीरो में जाएगी, वन होगी तो वन में जाएगी. ओके? ओके. यह है चलन की बात. ओके. ओनली चलन. अब आगे बिल में. तो बिल में जीरो और वन का फंडा है ही नहीं. जी. यह ठीक है? बिल में जीरो और वन का फंडा है ही नहीं. अगर वो जीएसटी में बिल बनाता है तो वो बाय डिफॉल्ट वन हो गया. अगर वो जीरो भी होगा तो भी वन हो गया. जी. और नॉन जीएसटी में बिल बनता है तो वो वन भी होगा तो जीरो हो गया. हाँ. तो अभी जो चलन बन रहे हैं, तो पहले तो चलन में आप देखना वन वाली आइटम है तो भी जीएसटी काउंट नहीं हो रहा, जीएसटी ऐड नहीं हो रहा. अच्छा. अठारह परसेंट दिखी नहीं रहा वहाँ पर. चलन बनाते वक्त. फिर बिल बनाते वक्त प्रॉब्लम यह आ रहा है कि जीरो वाली एक मिनट बनाते हैं मैंने अभी लॉन्च किया है अभी तो दिखा नहीं मैं खाली जीएसटी में देख कर बात कर रहा हूँ ठीक है? ठीक है तो मुझे ऐसा लगा और दूसरा आपने जो फ्रीटब वाला ऑप्शन डाला है वो मुझे ऐसा लग रहा है जो पार्टी होम में होगी वो डेटेक्स होन हो जाता है जो पार्टी जीरो में होगी वो डेटेक्स जीरो हो जाता है ठीक है? ठीक है तब जाके वो अगर वो ऑन कर दूँगा तब जाके वो ऑनली जीएसटी में काम करेगा यानि काउंट करेगा ठीक है तो डिडक्टिव वाला फंडा ओनली वील में यह तीनें काम करेंगे दूसरा आप व्हील में जीरो वन का टैग जो ऑन ऑफ है ठीक है अभी हमारे लिए ठीक है इसको लॉक कर दीजिएगा ठीक है बीड बनाते वक्त मेरे को उन्ने चाहूं तो भी उसको जीरो न कर पाऊँ ठीक है तो वो अपन वहाँ से हटा ही देंगे उसको लॉक कर देंगे उसको लॉक कर दें व्हील में यह फंडा मात्र ओनली चलन में काम करता है जी और दूसराज्यादा नहीं हर तरीके पर क्रिटिकल टॉक ही दिखेगा क्योंकि क्रिटिकल स्टॉक को लेके जब हम और स्टॉक माइनस होता है तो भी यही बतलाए वो आप देख लें अभी आप लिखना चालू करते हैं ओके डिपार्टमेंट के एंट्री होती है तो डिपार्टमेंट क्लोज हो रहा है एक ही एंट्री के साथ उससे सौन्दर ठीक है दूसरा बैंक मास्टर में डिफॉल्ट बैंक अगर सेलेक्ट करता हूँ तो वो कुछ काम नहीं कर रहा है यानि हैड नहीं हो रहा तो वो अपना बैंक काम नहीं कर रहा है ठीक है ठीक है डिपार्टमेंट के एंट्री होती है तो डिपार्टमेंट क्लोज हो रहा है एक ही एंट्री के बाद ओके इससे सौन्दर अच्छा सर मैं एक बार वो भी चेक करवा दूँ ठीक है विदाउट जीएसटी परसेंटेज डॉंट अलाउड टू एड ऐस ओके चार्जेस का कोड जब भी ऐड हो रहा है तो उसमें अगर मैं परसेंटेज नहीं डालता फिर भी ऐड हो रहा है तो वो ऐड नहीं होना चाहिए चार्जेस का कोड जब ऐड होता है तो उसमें टंपल मैनुअली है परसेंटेज ऐड होना चाहिए ठीक है जीएसटी परसेंटेज तो जब एड करते हैं मैं अपना ठीक है तो परसेंटेज लगा देंगे कि अगर अपने नहीं बढ़ा तो वो नहीं होगा ओके ठीक है दूसरा परचेज मास्टर में लेबल नहीं है डिस्काउंट लेबल का ऑप्शन परचेज मास्टर में नहीं दिया आपने ठीक है यानी हम सेल से डिस्काउंट कल्कुलेट करके करते हैं वैसे परसेंटेज भी अरे परचेज भी डिस्काउंट को कल्कुलेट करके चलते हैं तो वो ऐड नहीं है अच्छा तो आपको सप्लायर्स में भी वो सेम लेवल चाहिए हाँ एक्जैक्टली सप्लायर्स में भी वो सेम लेवल चाहिए ठीक है ओके आइटम व्यू ब्रांड वाइज नहीं हो रहा है ओके ऐटम व्यू में हमने लेबल वाइज किया था तो उसको लेबल हटा कर डिपार्टमेंट वाइज करवा दीजिए डिपार्टमेंट और ब्रांड ٹھیک ہے چلو کوئی بات نہیں ہے ٹھیک ہے چلو ٹھیک ہے، اس بار دوبارہ ये क्या है? उसमें हम कुछ ऐसे डाल देंगे कि आपको एक्जिटर दिख जाएगा कि आप कौन से फॉर्मैट में लॉक दे रहे हैं. हाँ, जीएसटी में हो या नॉन जीएसटी में हो.

> UPDATES

1. In party, the concept of zero and one should be understood clearly. When we are talking about challan (not bill), keep in mind. When challan is created, if item is zero then it will go in zero, if it is one then it will go in one. This is only for challan.
2. Now in bill, there is no concept of zero and one. If bill is created in GST firm, then by default it is one. Even if it is zero, it will be treated as one. And if bill is created in non-GST firm, then even if it is one, it will be treated as zero (basically force the 1/0 based on firm's 1/0). Also, in bill the zero/one tag (on/off) should be locked — while creating bill, even if I want, I should not be able to change it. Remove or lock it there. This zero/one concept should work only in challan.
3. In current challan creation, even if item is 1, GST is not getting counted or added. 18% is not showing there while creating challan. While creating bill, there is also a problem (he mentioned he just launched and is checking GST side only).
4. The deduct option you added — it feels like if party is in 1, then deduct is on. If party is in 0, then deduct becomes zero. And only when this is turned on, then it works only in GST (means it counts GST). Deductive thing works only there.
5. Critical stock should always be shown. Even when stock goes negative, it should show properly.
6. In department entry, after one entry, the department is getting closed. This should not happen.
7. In bank master, when I select default bank, it is not working (not getting added / not reflecting).
8. Without GST percentage, it should not allow adding charges code. Currently even if percentage is not entered, it still gets added. It should not happen. Percentage should be mandatory while adding charges.
9. In purchase master, there is no label/option for discount. Like in sales we calculate discount, same should be available in purchase also (percentage based). Same discount level/logic should be there for suppliers also.
10. Item view is not working brand-wise. In item view, currently it is label-wise — remove label and make it department-wise (and brand also).
11. There should be something shown clearly to indicate whether it is GST or non-GST mode. (have 2 colors of sidebar for gst and nongst firm seperate

# --------------------- 26 MARCH 2026 ----------------------

> UPDATES

• remove gst toggle from top & add in show all toggle
• GST toggle
• 0 → red 1 → black
• Items in GST in challan auto get gst %. (Challan create)
• Challan must show all 1 & 0
• Start date → 1/4/26 to today
• All date in dd/mm/yy
• amount 1000 — Choose brand, party — aab kya hoga vo algo us brand ke random item lega & total (sale rate + disc) ke hisabse vo random kitne bhi items kaise bhi us brand se lega & exactly 1000 ka bill daily banega. If item stock goes 0 — it switch do different item.
• challan ka payment nahi hoga — challan bill me convert then payment
• Outstanding me payment type filter based on sup/party
• days & last date & amt reviewed
• days count filter in outst list
• Multi-item in outstanding list
• remove type & firm from table
• Date → 1 mar 26 then feb total will be opening balance in account ledger
• Remove firm from item ledger
• Remove branch
• Stock (kab ayi & kab sell hui)
• 8:25
• collection report add bank/cash mode in table
• Profit = sale rate − purchase rate / purchase rate − sale rate
• State same → CGST & SGST 18% = 9% 9%
d/f state → IGST
• Item barcode mass pdf print to print that barcode & stick on item physically
• barcode scan via scanner physically

> this gets serious here:

we need to introduce a role based login in every user.
so that when user logs in, based on his role, he will have access to certain features and restrictions on certain features.

current users collection:
User {l
admin: {credentials and data}
gst_firm: {credentials and data}
nongst_firm: {credentials and data}
}

this software will be sold as software as a service and every user will have a sub user which will have limited control over how they see and perform actions in the software.
here are all sub users which main user will have:

```md
_Admin_
Do anything
_Accounts_
Cant delete
Cant edit
Add new.. All thing.
See outstanding..
Cash recived..
Bank recived..
View all.. But cant edit and delete..
_Salesmen_
View outstanding..
View reports
_Client_
Only view own outstandings.
View serch item.. And view mrp only.. Amd pics..
```

# -------------------------------------------

so is project me har user ek collection hai and ye user ya to 'main' honge ya 'secondary'
main user is project ka owner hoga yani mein. secondary users vo honge jisko me ye software sell karunga.
main user super admin hoga and isme admin credentials honga, matlab admin credentials se agr login krta hai login screen me to vo sidha admin panel pr jayega.
har user ke paas compulsory 2 credentials to honge hi. ye credentials firm (gst, nongst) ke credentials hai. matlab agar me gst firm ke credentials se login krta hu to vo gst firm ke dashboard pr jayega and agar me nongst firm ke credentials se login krta hu to

# -------------------------------------------

USER ME JESE GST NONGST ADMIN KE CREDS HAI VESE HI SALESPERSON AUR ACCOUNTANT KE DALDO BAKI ROLE BASE SCREEN FRONTEND SE LAG JAYEGI

# ---------------------------------------------

i created a sale challan with 2 items {item1: stock=100, pcs sold=20; item2: stock=50, pcs sold=10} and saved this challan
now when I editted the challan, item1 stock becomes 80, item 2 stock becomes 40 which is good and should happen like this. but while editting the challan, I changed the pcs sold of item 1 to 15 in place of 20. Now when I save the challan:

1. what it should do:

- item 1 stock becomes (80 + (20 - 15)) = 85
- item 2 stock be as it is (40 + (10 - 10)) = 40 | (basically, current item stock + (previous sold - selling now in update))

2. what it is doing right now:

- item 1 stock becomes (80 - 15) = 65
- item 2 stock becomes (40 - 10) = 30

now other case with same example, if I created a purchase challan with 2 items {item1: stock=100, pcs purchased=20; item2: stock=50, pcs purchased=10} and saved this challan, it should do:

- item 1 stock becomes (100 + 20) = 120
- item 2 stock becomes (50 + 10) = 60 | (basically, current item stock + purchased pcs)

now if I edit the challan and update the purchased item count of item 1 to 15 in place of 20, it should do:

- item 1 stock becomes (120 - (20 - 15)) = 115
- item 2 stock becomes (60 - (10 - 10)) = 60 | (basically, current item stock - (previous purchased - purchasing now in update))

# ------------------- 29 APRIL 2026 -----------------

> STOCK CALCULATION

physical stock (PS), Logical Stock (LS)

initial
PS = 0
LS = 0

10 items purchased from GST supplier
PS = 10
LS = 10

20 items purchased from NONGST supplier
PS = 10 + (20) = 30
LS = 10

5 items sold from NONGST firm
PS = 30 - 5 = 25
LS = 10

5 items sold to any party from GST firm with DEDUCT OFF
PS = 25
LS = 5

5 items sold to any party from GST firm with DEDUCT ONN
PS = 20
LS = 0

> BUSINESS LOGIC

```js
if (firm is gst) {
   if (bill is purchase bill) {
      if (supplier is GST) {
         LS += PCS;
         PS += PCS;
      } else { // supplier is NONGST
         PS += PCS;
      }
   } else { // bill is sale bill
      if (DEDUCT is ONN) {
         LS -= PCS;
      } else { // DEDUCT is OFF
         PS -= PCS;
         LS -= PCS;
      }
   }
} else {
   if (bill is purchase bill) {
      if (supplier is GST) {
         LS += PCS;
         PS += PCS;
      } else { // supplier is NONGST
         PS += PCS;
      }
   } else { // bill is sale bill
      PS -= PCS;
      LS -= PCS;
   }
}
```

challan flow:

```js
if (challan is sale challan) {
   PS -= PCS;
} else if (challan is purchase challan) {
   ps += pcs;
}
```

> CALCULATION ERROR

I created a purchase bill, item stock was 0 initially > I purchased 50 pcs in that bill > then I saved the bill and the item stock is now 50 > this means PS = 50, LS = 50 > now I editted the bill and changed the pcs from 50 to 40 > this made the PS = 40 but the LS is still 50!, it should have changed to 40 as well...

> CHALLAN & BILL STOCK LOGIC:

input:

- operation = create | update | delete
- isBill = true | false
- converted_to_bill = true | false
- challan_type = Sale | Purchase
- PCS = count of item sold in sale challan/bill | count of item purchased in purchase challan/bill

```js
if (not isBill) { // isBill = false
   // CHALLAN FLOW
   if (creating challan) {
      if (challan type is Sale) {
         PS -= PCS // items sold to party, so stock substracted
      } else { // challan type is Purchase
         PS += PCS // stock added as we purchased items to refill stock from a supplier
      }
   } else if (editting challan) {
      if (challan type is Sale) {
         // PS += previous PCS; // add back the previous pcs which were deducted in stock
         // PS -= new PCS; // deduct the new pcs from stock
         // THESE 2 CALCULATION CAN BE MERGED INTO THIS:
         PS += (previous_PCS - new_PCS)
      } else { // challan type is Purchase
         // PS -= previous PCS; // remove the previous pcs which were added in stock
         // PS += new PCS; // add the new pcs to stock
         // THESE 2 CALCULATION CAN BE MERGED INTO THIS:
         PS -= (previous_PCS - new_PCS)
      }
   } else if (deleting challan) {
      if (challan type is Sale) {
         PS += PCS // add back the pcs to stock as we are deleting the sale challan
      } else { // challan type is Purchase
         PS -= PCS // remove the pcs from stock as we are deleting the purchase challan
      }
   }
} else { // isBill = true
   // BILL FLOW
   if (creating bill) {
      if (bill is sale bill) {
         if (deduct is onn) {
            LS -= PCS
            PS -= PCS
         } else { // deduct is off
            LS -= PCS
         }
      } else if (bill is purchase bill) {
         if (supplier is GST) {
            LS += PCS
            PS += PCS
         } else { // supplier is NONGST
            PS += PCS
         }
      }
   } else if (editting bill) {
      if (bill type is Sale) {
         // PS += previous PCS; // add back the previous pcs which were deducted in stock
         // PS -= new PCS; // deduct the new pcs from stock
         // THESE 2 CALCULATION CAN BE MERGED INTO THIS:
         PS += (previous_PCS - new_PCS)
      } else { // bill type is Purchase
         // PS -= previous PCS; // remove the previous pcs which were added in stock
         // PS += new PCS; // add the new pcs to stock
         // THESE 2 CALCULATION CAN BE MERGED INTO THIS:
         PS -= (previous_PCS - new_PCS)
      }
   } else if (deleting bill) {
      if (bill type is Sale) {
         if (deduct was onn) { // deduct was onn while creating the bill
            LS += PCS
            PS += PCS
         } else { // deduct was off while creating the bill
            LS += PCS
         }
      } else { // bill type is Purchase
         if (supplier is GST) { // the supplier is of type GST
            LS += PCS
            PS += PCS
         } else { // the supplier is of type NONGST
            PS += PCS
         }
      }
   }
}
```

item stock was 40, I created a bill and I had deduct onn, and I sold 15 from stock, so according to the decision tree and challan bill logic, the stock of item should be equal to 25 but instead the stock incremented to 55..

# ------------------ 1 May 2026 ------------------

```js
} else { // isBill = true
   // BILL FLOW
   if (creating bill) {
      if (bill is sale bill) {
         if (deduct is onn) {
            LS -= PCS
            PS -= PCS
         } else { // deduct is off
            LS -= PCS
         }
      } else if (bill is purchase bill) {
         if (firm is GST) {
            LS += PCS
            PS += PCS
         } else { // firm is NONGST
            PS += PCS
         }
      }
   } else if (editting bill) {
      if (bill type is Sale) {
         // PS += previous PCS; // add back the previous pcs which were deducted in stock
         // PS -= new PCS; // deduct the new pcs from stock
         // THESE 2 CALCULATION CAN BE MERGED INTO THIS:
         PS += (previous_PCS - new_PCS)
      } else { // bill type is Purchase
         if (firm is GST) { // firm from which the bill was created (bill.is_gst == 1)
            // PS -= previous PCS; // remove the previous pcs which were added in stock
            // PS += new PCS; // add the new pcs to stock
            // THESE 2 CALCULATION CAN BE MERGED INTO THIS:
            PS -= (previous_PCS - new_PCS)
            LS -= (previous_PCS - new_PCS)
         } else { // firm is NONGST // firm from which the bill was created (bill.is_gst == 0)
            PS -= (previous_PCS - new_PCS)
         }
      }
   } else if (deleting bill) {
      if (bill type is Sale) {
         if (deduct was onn) { // deduct was onn while creating the bill
            LS += PCS
            PS += PCS
         } else { // deduct was off while creating the bill
            LS += PCS
         }
      } else { // bill type is Purchase
         if (firm is GST) { // the // firm from which the bill was created (bill.is_gst == 1)
            LS += PCS
            PS += PCS
         } else { // the firm is of type NONGST // firm from which the bill was created (bill.is_gst == 0)
            PS += PCS
         }
      }
   }
}
```

# --------------------------------------------------

there is a simpler flow for outstanding and transaction master.
when a transaction is created, add that amount to party's balance and when a bill is being settled, instead of fetching all transactions of that party, simply load the party's balance and we settle bill from that balance now
