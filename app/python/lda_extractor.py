import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.decomposition import LatentDirichletAllocation
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
import json
import sys
from typing import List, Dict, Tuple

def initialize_nltk():
    """Download required NLTK data"""
    nltk.download('punkt', quiet=True)
    nltk.download('stopwords', quiet=True)
    nltk.download('averaged_perceptron_tagger', quiet=True)

def clean_text(text: str) -> str:
    """Clean and preprocess text"""
    stop_words = set(stopwords.words('english'))
    stop_words -= {'he', 'she', 'him', 'her', 'his', 'hers', 'himself', 'herself'}
    
    # Handle non-string input
    if not isinstance(text, str):
        text = str(text)
    
    tokens = word_tokenize(text.lower())
    tokens = [token for token in tokens if 
             token.isalpha() and 
             token not in stop_words and
             len(token) > 2]
    return ' '.join(tokens)

def extract_topics(responses: List[Dict[str, str]], n_topics: int = 5) -> Dict:
    try:
        # Initialize NLTK and clean responses
        initialize_nltk()
        cleaned_responses = [clean_text(response['text']) for response in responses]
        
        # Create document-term matrix
        vectorizer = CountVectorizer(
            max_df=0.95,
            min_df=2,
            stop_words='english',
            max_features=1000
        )
        
        doc_term_matrix = vectorizer.fit_transform(cleaned_responses)
        
        # Train LDA model
        lda = LatentDirichletAllocation(
            n_components=n_topics,
            random_state=42,
            max_iter=10,
            learning_method='online',
            n_jobs=-1
        )
        
        # Get topic distributions for each document
        doc_topics = lda.fit_transform(doc_term_matrix)
        
        # Get feature names
        feature_names = vectorizer.get_feature_names_out()
        
        # Extract topics and their words
        topics = []
        for topic_idx, topic in enumerate(lda.components_):
            top_word_indices = topic.argsort()[:-10-1:-1]
            top_words = [feature_names[i] for i in top_word_indices]
            topic_weight = topic[top_word_indices].tolist()
            
            # Normalize weights
            total_weight = sum(topic_weight)
            if total_weight > 0:
                topic_weight = [w/total_weight for w in topic_weight]
            
            topics.append({
                'topic_id': int(topic_idx),
                'words': top_words,
                'weights': topic_weight
            })
        
        return {
            'topics': topics,
            'doc_topic_distributions': doc_topics.tolist()
        }
        
    except Exception as e:
        print(f"Error in extract_topics: {str(e)}", file=sys.stderr)
        return {
            'error': str(e),
            'topics': [],
            'doc_topic_distributions': []
        }

if __name__ == "__main__":
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        
        # Ensure we have a list of dictionaries with text and race
        if not isinstance(input_data, list):
            print(json.dumps({
                'error': 'Input must be a list of response objects',
                'topics': [],
                'doc_topic_distributions': [],
                'race_distributions': []
            }))
            sys.exit(1)
            
        results = extract_topics(input_data)
        print(json.dumps(results))
        
    except json.JSONDecodeError as e:
        print(json.dumps({
            'error': f'Invalid JSON input: {str(e)}',
            'topics': [],
            'doc_topic_distributions': [],
            'race_distributions': []
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'error': f'Script error: {str(e)}',
            'topics': [],
            'doc_topic_distributions': [],
            'race_distributions': []
        }))
        sys.exit(1) 