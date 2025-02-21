import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
import requests
import json
import sys
import logging
from typing import List, Dict, Any
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv("../../.env.local")

# Configure logging
logging.basicConfig(level=logging.INFO, stream=sys.stderr,
                    format='%(asctime)s - %(levelname)s - %(message)s')

API_URL = "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2"
huggingface_token = os.getenv("HUGGING_FACE_API")
headers = {"Authorization": f"Bearer {huggingface_token}"}

def get_embeddings(texts: List[str]) -> np.ndarray:
    try:
        # Ensure the API token is present
        huggingface_token = os.getenv("HUGGING_FACE_API")
        if not huggingface_token:
            raise ValueError("Missing Hugging Face API token")
        headers = {"Authorization": f"Bearer {huggingface_token}"}

        # Ensure all texts are strings
        texts = [str(text) for text in texts]

        logging.info(f"Getting embeddings for {len(texts)} texts")
        payload = {"inputs": texts, "options": {"wait_for_model": True}}
        logging.info("Payload: " + json.dumps(payload))

        logging.info("Making request to Hugging Face API")
        response = requests.post(
            API_URL,
            headers=headers,
            json=payload
        )
        response.raise_for_status()
        
        # Convert the response to a numpy array
        embeddings = np.array(response.json())
        logging.info(f"Initial embeddings shape: {embeddings.shape}")
        
        # If the embeddings are token-level (3D array), pool (mean) over tokens to get a single embedding per text
        if embeddings.ndim == 3:
            embeddings = np.mean(embeddings, axis=1)
            logging.info(f"After pooling, embeddings shape: {embeddings.shape}")
            
        return embeddings
        
    except Exception as e:
        logging.error(f"Failed to get embeddings: {str(e)}", exc_info=True)
        raise


def extract_concepts_with_embeddings(input_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    try:
        logging.info(f"Starting concept extraction with {len(input_data)} items")
        
        responses = []
        demographics_list = []  # Store demographics for each response
        
        for item in input_data:
            if isinstance(item, dict) and 'response' in item:
                responses.append(item['response'])
                demog: Dict[str, Any] = {}
                if 'demographics' in item:
                    raw_demo = item['demographics']
                    if isinstance(raw_demo, dict):
                        # For each demographic category, store its value (or list of values)
                        for category, value in raw_demo.items():
                            demog[category] = value
                    elif isinstance(raw_demo, list):
                        # If demographics is a simple list, store under a default key.
                        demog["default"] = raw_demo
                    else:
                        demog["default"] = raw_demo
                else:
                    demog["default"] = "Unknown"
                demographics_list.append(demog)
        
        logging.info(f"Processed {len(responses)} valid responses")
        
        if len(responses) < 2:
            raise Exception("Need at least 2 responses for clustering")
        
        # Get embeddings, PCA, and clustering as before...
        embeddings = get_embeddings(responses)
        
        n_components = min(embeddings.shape[1], len(responses) - 1, 2)
        pca = PCA(n_components=n_components)
        pca_coordinates = pca.fit_transform(embeddings)
        
        if pca_coordinates.shape[1] == 1:
            pca_coordinates = np.column_stack([pca_coordinates, np.zeros(len(responses))])
        elif pca_coordinates.shape[1] > 2:
            pca_coordinates = pca_coordinates[:, :2]
            
        if pca_coordinates.shape[1] != 2:
            raise Exception("Failed to generate 2D PCA coordinates")

        explained_variance = pca.explained_variance_ratio_
        print(f"PCA explained variance ratios: {explained_variance}", file=sys.stderr)
        
        n_clusters = min(4, len(responses))
        if n_clusters < 2:
            n_clusters = 1
        
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        cluster_labels = kmeans.fit_predict(embeddings)
        
        cluster_concepts = []
        for i in range(n_clusters):
            cluster_mask = cluster_labels == i
            cluster_responses = np.array(responses)[cluster_mask]
            cluster_embeddings = embeddings[cluster_mask]
            cluster_coordinates = pca_coordinates[cluster_mask]
            # Build a flat distribution across all demographic categories.
            cluster_demographics = np.array(demographics_list)[cluster_mask]
            distribution = {}
            for demog in cluster_demographics:
                if isinstance(demog, dict):
                    for category, value in demog.items():
                        if isinstance(value, list):
                            for v in value:
                                key = f"{category}:{v}"
                                distribution[key] = distribution.get(key, 0) + 1
                        else:
                            key = f"{category}:{value}"
                            distribution[key] = distribution.get(key, 0) + 1
                else:
                    key = f"default:{demog}"
                    distribution[key] = distribution.get(key, 0) + 1
                    
            if cluster_coordinates.shape[1] != 2:
                raise Exception(f"Invalid PCA coordinates shape: {cluster_coordinates.shape}")
                    
            cluster_concepts.append({
                "cluster_id": int(i),
                "size": int(np.sum(cluster_mask)),
                "representative_responses": cluster_responses.tolist(),
                "distribution": distribution,
                "embeddings": cluster_embeddings.tolist(),
                "coordinates": cluster_coordinates.tolist()
            })
        
        logging.info("Successfully completed concept extraction")
        return cluster_concepts
        
    except Exception as e:
        logging.error(f"Failed to extract concepts: {str(e)}", exc_info=True)
        raise


if __name__ == "__main__":
    try:
        logging.info("Reading input from stdin")
        input_data = json.loads(sys.stdin.read())
        logging.info(f"Received {len(input_data)} items")
        
        result = extract_concepts_with_embeddings(input_data)
        
        # Ensure only the JSON result goes to stdout
        print(json.dumps(result))
        sys.stdout.flush()
        logging.info("Successfully completed processing")
        
    except Exception as e:
        logging.error("Fatal error in main", exc_info=True)
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
