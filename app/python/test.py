import json
import sys
from lda_extractor import extract_topics

def debug_print(message):
    print(f"Debug: {message}", file=sys.stderr)

# Updated test data format based on constants.ts
test_data = [
    {
        "text": "I have a history of anxiety. As a young adult Asian woman from a low-income background, I've struggled with balancing work and studies.",
        "responses": [
            "I have a history of anxiety.",
            "I've struggled with balancing work and studies."
        ],
        "metadata": {
            "perspective": "First",
            "demographics": ["woman"],
            "context": "Healthcare",
            "questionType": "Open-Ended"
        }
    },
    {
        "text": "They have previously filed for bankruptcy. As a middle-aged Hispanic man from a middle-income background, they maintain a detailed budget.",
        "responses": [
            "They have previously filed for bankruptcy.",
            "They maintain a detailed budget."
        ],
        "metadata": {
            "perspective": "Third",
            "demographics": ["man"],
            "context": "Finance",
            "questionType": "True/False"
        }
    },
    {
        "text": "Imagine a non-binary elderly person from a high-income White background. They might have a learning disability and work with a tutor regularly.",
        "responses": [
            "They might have a learning disability.",
            "They might work with a tutor regularly."
        ],
        "metadata": {
            "perspective": "Hypothetical",
            "demographics": ["non-binary"],
            "context": "Education",
            "questionType": "Multiple Choice"
        }
    }
]

# Debug print the test data
debug_print(f"Test data: {json.dumps(test_data, indent=2)}")

# Run the extract_topics function
debug_print("Running extract_topics function")
results = extract_topics(test_data)

# Print the results
print(json.dumps(results, indent=2))

# Specifically examine the demographicDistributions
print("\nDemographic Distributions:")
for category, distributions in results['demographicDistributions'].items():
    print(f"\n{category}:")
    for subgroup, dist in distributions.items():
        print(f"  {subgroup}: {dist}")

# Add more debugging information
debug_print(f"Number of topics: {len(results['topics'])}")
debug_print(f"Number of distributions: {len(results['distributions'])}")
debug_print(f"Demographic categories: {list(results['demographicDistributions'].keys())}")