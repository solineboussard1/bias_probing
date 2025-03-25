import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.decomposition import LatentDirichletAllocation
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
import json
import sys
from typing import List, Dict, Any

def initialize_nltk():
    """Download required NLTK data"""
    nltk.download('punkt', quiet=True)
    nltk.download('stopwords', quiet=True)
    nltk.download('averaged_perceptron_tagger', quiet=True)

def clean_text(text: str) -> str:
    """Clean and preprocess text"""
    stop_words = set(stopwords.words('english'))
    # Optionally remove specific words if needed
    stop_words -= {'he', 'she', 'him', 'her', 'his', 'hers', 'himself', 'herself'}
    
    if not isinstance(text, str):
        text = str(text)
    
    tokens = word_tokenize(text.lower())
    tokens = [token for token in tokens if token.isalpha() and token not in stop_words and len(token) > 2]
    return ' '.join(tokens)

def extract_topics(responses: List[Dict[str, Any]], n_topics: int = 5) -> Dict:
    try:
        print("Initializing NLTK...", file=sys.stderr)
        initialize_nltk()

        print("Cleaning responses...", file=sys.stderr)
        cleaned_responses = [clean_text(response['text']) for response in responses]
        print(f"Cleaned {len(cleaned_responses)} responses", file=sys.stderr)

        print("Creating document-term matrix...", file=sys.stderr)
        vectorizer = CountVectorizer(
            max_df=0.95,
            min_df=1,
            stop_words='english',
            max_features=1000
        )
        doc_term_matrix = vectorizer.fit_transform(cleaned_responses)
        print(f"Document-term matrix shape: {doc_term_matrix.shape}", file=sys.stderr)

        print("Training LDA model...", file=sys.stderr)
        lda = LatentDirichletAllocation(
            n_components=n_topics,
            random_state=42,
            max_iter=10,
            learning_method='online'
        )
        doc_topics = lda.fit_transform(doc_term_matrix)
        print("LDA training completed!", file=sys.stderr)

        feature_names = vectorizer.get_feature_names_out()
        print("Extracting topics...", file=sys.stderr)

        topics = []
        for topic_idx, topic in enumerate(lda.components_):
            top_word_indices = topic.argsort()[:-11:-1]
            top_words = [feature_names[i] for i in top_word_indices]
            topic_weights = topic[top_word_indices].tolist()
            total_weight = sum(topic_weights)
            if total_weight > 0:
                topic_weights = [w / total_weight for w in topic_weights]
            topics.append({
                'topic_id': int(topic_idx),
                'words': top_words,
                'weights': topic_weights
            })

        print("Extracted topics successfully!", file=sys.stderr)

        return {
            'topics': topics,
            'distributions': doc_topics.tolist()
        }

    except Exception as e:
        print(f"Error in extract_topics: {str(e)}", file=sys.stderr)
        return {
            'error': str(e),
            'topics': [],
            'distributions': []
        }


if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        if not isinstance(input_data, list):
            print(json.dumps({
                'error': 'Input must be a list of response objects',
                'topics': [],
                'distributions': [],
                'demographic_distributions': {}
            }))
            sys.exit(1)
            
        results = extract_topics(input_data)
        print(json.dumps(results))
        
    except json.JSONDecodeError as e:
        print(json.dumps({
            'error': f'Invalid JSON input: {str(e)}',
            'topics': [],
            'distributions': [],
            'demographic_distributions': {}
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'error': f'Script error: {str(e)}',
            'topics': [],
            'distributions': [],
            'demographic_distributions': {}
        }))
        sys.exit(1)