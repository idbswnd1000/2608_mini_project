from datasets import load_dataset

# 데이터셋 불러오기
ds = load_dataset(
    "bitext/Bitext-customer-support-llm-chatbot-training-dataset"
)

df = ds["train"].to_pandas()

# 사용할 intent 10개
selected_intents = [
    "place_order",
    "cancel_order",
    "change_order",
    "track_order",
    "get_refund",
    "track_refund",
    "check_refund_policy",
    "delivery_period",
    "delivery_options",
    "payment_issue",
]

# 각 intent에서 300개씩 추출
filtered_df = (
    df[df["intent"].isin(selected_intents)]
    .groupby("intent", group_keys=False)
    .sample(n=300, random_state=42)
)

# 필요한 컬럼만 사용
filtered_df = filtered_df[
    [
        "category",
        "intent",
        "instruction",
        "response",
    ]
]

# 행 순서 섞기
filtered_df = filtered_df.sample(
    frac=1,
    random_state=42,
).reset_index(drop=True)

# CSV 저장
filtered_df.to_csv(
    "customer_support_3000.csv",
    index=False,
    encoding="utf-8-sig",
)

print("저장 완료")
print("데이터 크기:", filtered_df.shape)

print("\nIntent별 개수")
print(filtered_df["intent"].value_counts())

print("\n샘플")
print(filtered_df.head())