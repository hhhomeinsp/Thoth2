import sys
import json
import os
import PyPDF2
import logging
import traceback
from openai import OpenAI
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# Load environment variables
load_dotenv()

# Set up OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

if not client.api_key:
    logging.error("No OpenAI API key found. Please set the OPENAI_API_KEY environment variable.")
    sys.exit(1)

def analyze_chunk(content: str) -> dict:
    """
    Analyze a chunk of text to identify placeholders using OpenAI's GPT model.
    """
    logging.info("Starting analysis of text chunk")
    logging.info(f"Content length: {len(content)}")

    try:
        logging.info("Sending request to OpenAI API")
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": """You are an AI assistant specialized in identifying potential placeholders in legal documents. 
                Placeholders are typically names, entity names, email addresses, phone numbers, dates, amounts, or other specific details that might need to be customized in a document.  
                They are not marked with any special characters. You need to infer what might be a placeholder based on context.
                Analyze the text and return a JSON array of objects, where each object represents a potential placeholder and contains the following fields:
                - placeholder: The text you've identified as a potential placeholder
                - description: A short description of what type of placeholder it is. 
                - explanation: A brief explanation of why you think this is a placeholder and what it might represent
                - newValue: An empty string for the user to fill in later"""},
                {"role": "user", "content": f"Analyze the following document chunk and identify potential placeholders. Return the result as a JSON array of objects: {content[:2000]}..."}  # Increased character limit
            ]
        )
        logging.info("Received response from OpenAI API")
        response_content = response.choices[0].message.content
        logging.info(f"Raw API response: {response_content[:500]}...")  # Truncated for logging
        
        try:
            # Clean up the response content to remove any markdown-like code blocks
            json_content = response_content.strip()
            if json_content.startswith('```json'):
                json_content = json_content[7:]
            if json_content.endswith('```'):
                json_content = json_content[:-3]

            # Attempt to parse the cleaned JSON content
            placeholders = json.loads(json_content)
            if not isinstance(placeholders, list):
                raise ValueError("Expected a JSON array of objects")
            
            # Validate the structure of each placeholder object
            for placeholder in placeholders:
                required_keys = ["placeholder", "description", "explanation", "newValue"]
                if not all(key in placeholder for key in required_keys):
                    raise ValueError(f"Invalid placeholder object structure: {placeholder}")
            
            return {"placeholders": placeholders}
        except json.JSONDecodeError as json_err:
            logging.error(f"Failed to parse JSON from API response: {str(json_err)}")
            logging.error(f"Full raw response: {response_content}")  # Log full response for debugging
            return {"error": f"Failed to parse API response: {str(json_err)}", "raw_response": response_content}
        except ValueError as val_err:
            logging.error(f"Invalid response format: {str(val_err)}")
            logging.error(f"Full raw response: {response_content}")  # Log full response for debugging
            return {"error": f"Invalid response format: {str(val_err)}", "raw_response": response_content}
    except Exception as e:
        logging.error(f"Error during OpenAI API call: {str(e)}")
        logging.error(f"Error details: {traceback.format_exc()}")
        return {"error": f"Error analyzing chunk: {str(e)}"}

def extract_text_from_pdf(file_path):
    with open(file_path, 'rb') as file:
        reader = PyPDF2.PdfReader(file)
        text = ""
        for page in reader.pages:
            text += page.extract_text()
    return text

def main():
    logging.info("Starting analyze_utils.py")
    logging.info(f"Python version: {sys.version}")
    logging.info(f"Current working directory: {os.getcwd()}")
    logging.info(f"Script location: {os.path.abspath(__file__)}")
    
    try:
        if len(sys.argv) < 3:
            raise ValueError("Usage: python analyze_utils.py <file_name> <file_path>")

        file_name = sys.argv[1]
        file_path = sys.argv[2]

        logging.info(f"Processing file: {file_name}")
        logging.info(f"File path: {file_path}")

        if file_name.lower().endswith('.pdf'):
            content = extract_text_from_pdf(file_path)
        else:
            with open(file_path, 'r', encoding='utf-8') as file:
                content = file.read()

        logging.info(f"Content length: {len(content)}")

        result = analyze_chunk(content)
        output = {
            "file_name": file_name,
            "analysis": result
        }
        print(json.dumps(output, ensure_ascii=False))
        logging.info(f"File {file_name} processed successfully.")
        logging.info(f"Output: {json.dumps(output, ensure_ascii=False)}")
    except Exception as e:
        error_message = {
            "error": f"An unexpected error occurred: {str(e)}",
            "traceback": traceback.format_exc()
        }
        logging.error(json.dumps(error_message, ensure_ascii=False))
        print(json.dumps(error_message, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
