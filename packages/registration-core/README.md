# @kids/registration-core

家長端（apps/parents）與同工端（apps/registration 的現場報名、匯入舊資料）共用的報名程式：
資料表、報名送出與資格檢查、家長 PIN 驗證、報名表元件、家長端主題樣式。

- 寫入身分一律是 `registration`（報名、家庭、成員表的 owner），兩個 app 都用這裡的 `lib/tables`。
- app 之間不能互相 import，共用的東西放這裡。
