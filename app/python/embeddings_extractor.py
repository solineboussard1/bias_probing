import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
import requests
import json
import sys
import logging
from typing import List
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv(".env.local")

# Configure logging
logging.basicConfig(level=logging.INFO, stream=sys.stderr,
                   format='%(asctime)s - %(levelname)s - %(message)s')

API_URL = "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2"
huggingface_token = os.getenv("HUGGING_FACE_API")
headers = {"Authorization": f"Bearer {huggingface_token}"}

def get_embeddings(texts):
    try:
        logging.info(f"Getting embeddings for {len(texts)} texts")
        payload = {"inputs": texts}
        
        logging.info("Making request to Hugging Face API")
        response = requests.post(API_URL, headers=headers, json={"inputs": texts, "options":{"wait_for_model":True}})
        response.raise_for_status()
        
        embeddings = np.array(response.json())
        
        logging.info(f"Successfully got embeddings with shape {embeddings.shape}")
        return embeddings
        
    except Exception as e:
        logging.error(f"Failed to get embeddings: {str(e)}", exc_info=True)
        raise

def extract_concepts_with_embeddings(input_data):
    try:
        logging.info(f"Starting concept extraction with {len(input_data)} items")
        
        # Parse input data
        responses = []
        races = []
        valid_races = {'Asian', 'Black', 'Hispanic', 'White', 'Unknown'}
        
        # Create unique entries
        for item in input_data:
            if isinstance(item, dict) and 'response' in item and 'race' in item:
                responses.append(item['response'])
                race = item['race'] if item['race'] in valid_races else 'Unknown'
                races.append(race)
        
        logging.info(f"Processed {len(responses)} valid responses")
        
        if len(responses) < 2:
            raise Exception("Need at least 2 responses for clustering")
        
        # Get embeddings
        embeddings = get_embeddings(responses)
        
        # Calculate PCA - modified to handle dimensionality properly
        n_components = min(embeddings.shape[1], len(responses) - 1, 2)
        pca = PCA(n_components=n_components)
        pca_coordinates = pca.fit_transform(embeddings)
        
        # Only add a zero column if we have exactly 1 component
        if pca_coordinates.shape[1] == 1:
            pca_coordinates = np.column_stack([pca_coordinates, np.zeros(len(responses))])
        elif pca_coordinates.shape[1] > 2:
            # If we somehow get more than 2 components, take only first 2
            pca_coordinates = pca_coordinates[:, :2]
            
        # Ensure we have 2D coordinates
        if pca_coordinates.shape[1] != 2:
            raise Exception("Failed to generate 2D PCA coordinates")

        # Print debug info to stderr instead of stdout
        explained_variance = pca.explained_variance_ratio_
        print(f"PCA explained variance ratios: {explained_variance}", file=sys.stderr)
        
        # Clustering - ensure n_clusters is appropriate for the data size
        n_clusters = min(4, len(responses))
        if n_clusters < 2:
            n_clusters = 1
        
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        cluster_labels = kmeans.fit_predict(embeddings)
        
        # Extract cluster information with verified 2D coordinates
        cluster_concepts = []
        for i in range(n_clusters):
            cluster_mask = cluster_labels == i
            cluster_responses = np.array(responses)[cluster_mask]
            cluster_races = np.array(races)[cluster_mask]
            cluster_embeddings = embeddings[cluster_mask]
            cluster_coordinates = pca_coordinates[cluster_mask]
            
            if len(cluster_responses) > 0:
                distribution = {race: 0 for race in valid_races}
                unique_races, race_counts = np.unique(cluster_races, return_counts=True)
                for race, count in zip(unique_races, race_counts):
                    if race in valid_races:
                        distribution[race] = int(count)
                
                # Verify coordinates are 2D before adding to result
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